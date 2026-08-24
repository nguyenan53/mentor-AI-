import type { ProjectStateStore } from './project-state-store.js';
import {
  isTaskTransitionAllowed,
  isTerminalTaskStatus,
  taskResumeRequiresApprovedDecision,
  type TaskState,
  type TaskStatus,
  type TaskTransitionRecord,
} from '../domain/task-state.js';

export type TaskStateMachineErrorCode =
  | 'TASK_ID_INVALID'
  | 'TASK_ALREADY_EXISTS'
  | 'TASK_NOT_FOUND'
  | 'TASK_TRANSITION_INVALID'
  | 'TASK_TERMINAL'
  | 'TASK_APPROVAL_REQUIRED'
  | 'TASK_REASON_INVALID'
  | 'TASK_EVIDENCE_INVALID'
  | 'TASK_APPROVAL_INVALID'
  | 'TASK_TIMESTAMP_INVALID';

export class TaskStateMachineError extends Error {
  constructor(
    readonly code: TaskStateMachineErrorCode,
    message: string,
    readonly taskId?: string,
    readonly from?: TaskStatus,
    readonly to?: TaskStatus,
  ) {
    super(message);
    this.name = 'TaskStateMachineError';
  }
}

export interface TaskTransitionInput {
  to: TaskStatus;
  reason: string;
  evidenceReferences: readonly string[];
  approvedDecisionId?: string;
}

export interface TaskStateMachineOptions {
  now?: () => Date;
}

export class TaskStateMachine {
  private readonly now: () => Date;

  constructor(
    private readonly projectStateStore: ProjectStateStore,
    options: TaskStateMachineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async createTask(taskId: string): Promise<TaskState> {
    const normalizedTaskId = normalizeRequiredValue(taskId, 'TASK_ID_INVALID', 'Task ID must be non-empty.');
    const timestamp = this.createTimestamp(normalizedTaskId);
    let createdTask: TaskState | undefined;

    await this.projectStateStore.update((projectState) => {
      if (projectState.taskStates?.[normalizedTaskId]) {
        throw new TaskStateMachineError(
          'TASK_ALREADY_EXISTS',
          `Task already exists: ${normalizedTaskId}`,
          normalizedTaskId,
        );
      }

      createdTask = {
        taskId: normalizedTaskId,
        status: 'CREATED',
        createdAt: timestamp,
        updatedAt: timestamp,
        transitions: [],
      };

      return {
        ...projectState,
        currentTaskId: normalizedTaskId,
        taskStates: {
          ...projectState.taskStates,
          [normalizedTaskId]: createdTask,
        },
      };
    });

    return structuredClone(requireTaskResult(createdTask, normalizedTaskId));
  }

  async loadTask(taskId: string): Promise<TaskState | undefined> {
    const normalizedTaskId = normalizeRequiredValue(taskId, 'TASK_ID_INVALID', 'Task ID must be non-empty.');
    const projectState = await this.projectStateStore.load();
    const task = projectState?.taskStates?.[normalizedTaskId];
    return task ? structuredClone(task) : undefined;
  }

  async transitionTask(taskId: string, input: TaskTransitionInput): Promise<TaskState> {
    const normalizedTaskId = normalizeRequiredValue(taskId, 'TASK_ID_INVALID', 'Task ID must be non-empty.');
    const reason = normalizeRequiredValue(
      input.reason,
      'TASK_REASON_INVALID',
      'Task transition reason must be non-empty.',
      normalizedTaskId,
    );
    const evidenceReferences = normalizeEvidenceReferences(input.evidenceReferences, normalizedTaskId);
    const approvedDecisionId = normalizeOptionalApproval(input.approvedDecisionId, normalizedTaskId);
    const timestamp = this.createTimestamp(normalizedTaskId);
    let transitionedTask: TaskState | undefined;

    await this.projectStateStore.update((projectState) => {
      const currentTask = projectState.taskStates?.[normalizedTaskId];
      if (!currentTask) {
        throw new TaskStateMachineError(
          'TASK_NOT_FOUND',
          `Task does not exist: ${normalizedTaskId}`,
          normalizedTaskId,
          undefined,
          input.to,
        );
      }

      if (isTerminalTaskStatus(currentTask.status)) {
        throw new TaskStateMachineError(
          'TASK_TERMINAL',
          `Terminal task ${normalizedTaskId} cannot transition from ${currentTask.status}.`,
          normalizedTaskId,
          currentTask.status,
          input.to,
        );
      }

      if (!isTaskTransitionAllowed(currentTask.status, input.to)) {
        throw new TaskStateMachineError(
          'TASK_TRANSITION_INVALID',
          `Task transition is not allowed: ${currentTask.status} -> ${input.to}.`,
          normalizedTaskId,
          currentTask.status,
          input.to,
        );
      }

      if (taskResumeRequiresApprovedDecision(currentTask.status, input.to) && !approvedDecisionId) {
        throw new TaskStateMachineError(
          'TASK_APPROVAL_REQUIRED',
          `An approved decision is required to resume task ${normalizedTaskId} from ${currentTask.status}.`,
          normalizedTaskId,
          currentTask.status,
          input.to,
        );
      }

      if (timestamp < currentTask.updatedAt) {
        throw new TaskStateMachineError(
          'TASK_TIMESTAMP_INVALID',
          `Task clock moved backwards for ${normalizedTaskId}.`,
          normalizedTaskId,
          currentTask.status,
          input.to,
        );
      }

      const transition: TaskTransitionRecord = {
        timestamp,
        from: currentTask.status,
        to: input.to,
        reason,
        evidenceReferences,
        ...(approvedDecisionId ? { approvedDecisionId } : {}),
      };
      transitionedTask = {
        ...currentTask,
        status: input.to,
        updatedAt: timestamp,
        transitions: [...currentTask.transitions, transition],
      };

      return {
        ...projectState,
        currentTaskId: normalizedTaskId,
        taskStates: {
          ...projectState.taskStates,
          [normalizedTaskId]: transitionedTask,
        },
      };
    });

    return structuredClone(requireTaskResult(transitionedTask, normalizedTaskId));
  }

  private createTimestamp(taskId: string): string {
    try {
      return this.now().toISOString();
    } catch {
      throw new TaskStateMachineError(
        'TASK_TIMESTAMP_INVALID',
        `Task timestamp could not be created for ${taskId}.`,
        taskId,
      );
    }
  }
}

function normalizeRequiredValue(
  value: unknown,
  code: 'TASK_ID_INVALID' | 'TASK_REASON_INVALID',
  message: string,
  taskId?: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 500) {
    throw new TaskStateMachineError(code, message, taskId);
  }

  return value.trim();
}

function normalizeEvidenceReferences(value: unknown, taskId: string): string[] {
  if (!Array.isArray(value)) {
    throw new TaskStateMachineError(
      'TASK_EVIDENCE_INVALID',
      'Task transition evidence references must be an array.',
      taskId,
    );
  }

  const references: string[] = [];
  for (const reference of value) {
    if (typeof reference !== 'string' || reference.trim().length === 0 || reference.trim().length > 500) {
      throw new TaskStateMachineError(
        'TASK_EVIDENCE_INVALID',
        'Each task transition evidence reference must be a non-empty string.',
        taskId,
      );
    }
    references.push(reference.trim());
  }

  return references;
}

function normalizeOptionalApproval(value: unknown, taskId: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 500) {
    throw new TaskStateMachineError(
      'TASK_APPROVAL_INVALID',
      'Approved decision ID must be a non-empty string when provided.',
      taskId,
    );
  }

  return value.trim();
}

function requireTaskResult(task: TaskState | undefined, taskId: string): TaskState {
  if (!task) {
    throw new TaskStateMachineError(
      'TASK_NOT_FOUND',
      `Task state update produced no result: ${taskId}`,
      taskId,
    );
  }

  return task;
}
