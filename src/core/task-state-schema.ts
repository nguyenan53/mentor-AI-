import {
  isTaskStatus,
  isTaskTransitionAllowed,
  taskResumeRequiresApprovedDecision,
  type TaskState,
  type TaskTransitionRecord,
} from '../domain/task-state.js';

export interface TaskStateSchemaIssue {
  field: string;
  message: string;
}

export interface TaskStateSchemaResult {
  value?: Record<string, TaskState>;
  issues: TaskStateSchemaIssue[];
}

const TASK_STATE_KEYS = new Set(['taskId', 'status', 'createdAt', 'updatedAt', 'transitions']);
const TASK_TRANSITION_KEYS = new Set([
  'timestamp',
  'from',
  'to',
  'reason',
  'evidenceReferences',
  'approvedDecisionId',
]);

export function validateTaskStates(
  candidate: unknown,
  mode: 'load' | 'save',
): TaskStateSchemaResult {
  const issues: TaskStateSchemaIssue[] = [];
  if (candidate === undefined) return { issues };
  if (!isRecord(candidate)) {
    issues.push(issue('$.taskStates', 'taskStates must be an object when present.'));
    return { issues };
  }

  const taskStates = Object.create(null) as Record<string, TaskState>;
  for (const [mapTaskId, taskCandidate] of Object.entries(candidate)) {
    const normalizedMapTaskId = normalizeTaskText(
      mapTaskId,
      `$.taskStates.${mapTaskId}`,
      'Task-state map keys must be non-empty task IDs.',
      issues,
      mode,
    );
    if (!normalizedMapTaskId) continue;

    const taskState = validateTaskState(taskCandidate, normalizedMapTaskId, issues, mode);
    if (taskState) taskStates[normalizedMapTaskId] = taskState;
  }

  return issues.length === 0 ? { value: taskStates, issues } : { issues };
}

function validateTaskState(
  candidate: unknown,
  mapTaskId: string,
  issues: TaskStateSchemaIssue[],
  mode: 'load' | 'save',
): TaskState | undefined {
  const taskPath = `$.taskStates.${mapTaskId}`;
  const issueCountBeforeTask = issues.length;
  if (!isRecord(candidate)) {
    issues.push(issue(taskPath, 'Task state must be an object.'));
    return undefined;
  }

  for (const key of Object.keys(candidate)) {
    if (!TASK_STATE_KEYS.has(key)) {
      issues.push(issue(`${taskPath}.${key}`, 'Unknown task-state field.'));
    }
  }

  const taskId = normalizeTaskText(
    candidate.taskId,
    `${taskPath}.taskId`,
    'taskId must be a non-empty string.',
    issues,
    mode,
  );
  if (taskId && taskId !== mapTaskId) {
    issues.push(issue(`${taskPath}.taskId`, 'taskId must match its taskStates map key.'));
  }

  const status = candidate.status;
  if (!isTaskStatus(status)) {
    issues.push(issue(`${taskPath}.status`, 'Task status is not supported.'));
  }

  const createdAt = validateTaskTimestamp(candidate.createdAt, `${taskPath}.createdAt`, issues);
  const updatedAt = validateTaskTimestamp(candidate.updatedAt, `${taskPath}.updatedAt`, issues);

  const transitions: TaskTransitionRecord[] = [];
  const transitionCandidates = candidate.transitions;
  if (!Array.isArray(transitionCandidates)) {
    issues.push(issue(`${taskPath}.transitions`, 'transitions must be an array.'));
  } else {
    for (const [index, transitionCandidate] of transitionCandidates.entries()) {
      const transition = validateTaskTransition(
        transitionCandidate,
        `${taskPath}.transitions[${index}]`,
        issues,
        mode,
      );
      if (transition) transitions.push(transition);
    }
  }

  if (
    createdAt &&
    updatedAt &&
    isTaskStatus(status) &&
    Array.isArray(transitionCandidates) &&
    transitions.length === transitionCandidates.length
  ) {
    validateTransitionHistory(taskPath, status, createdAt, updatedAt, transitions, issues);
  }

  if (
    issues.length !== issueCountBeforeTask ||
    !taskId ||
    !isTaskStatus(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined;
  }

  return { taskId, status, createdAt, updatedAt, transitions };
}

function validateTransitionHistory(
  taskPath: string,
  status: TaskState['status'],
  createdAt: string,
  updatedAt: string,
  transitions: TaskTransitionRecord[],
  issues: TaskStateSchemaIssue[],
): void {
  let expectedStatus: TaskState['status'] = 'CREATED';
  let previousTimestamp = createdAt;

  for (const [index, transition] of transitions.entries()) {
    const transitionPath = `${taskPath}.transitions[${index}]`;
    if (transition.from !== expectedStatus) {
      issues.push(issue(`${transitionPath}.from`, `Transition history must continue from ${expectedStatus}.`));
    }
    if (!isTaskTransitionAllowed(transition.from, transition.to)) {
      issues.push(
        issue(`${transitionPath}.to`, `Transition ${transition.from} -> ${transition.to} is not allowed.`),
      );
    }
    if (taskResumeRequiresApprovedDecision(transition.from, transition.to) && !transition.approvedDecisionId) {
      issues.push(
        issue(
          `${transitionPath}.approvedDecisionId`,
          'Resuming from BLOCKED or ESCALATED requires an approved decision ID.',
        ),
      );
    }
    if (transition.timestamp < previousTimestamp) {
      issues.push(issue(`${transitionPath}.timestamp`, 'Transition timestamps must be monotonic.'));
    }
    expectedStatus = transition.to;
    previousTimestamp = transition.timestamp;
  }

  if (status !== expectedStatus) {
    issues.push(issue(`${taskPath}.status`, 'Task status must match the final transition state.'));
  }
  if (updatedAt !== previousTimestamp) {
    issues.push(
      issue(
        `${taskPath}.updatedAt`,
        'updatedAt must match the latest transition timestamp or createdAt.',
      ),
    );
  }
}

function validateTaskTransition(
  candidate: unknown,
  transitionPath: string,
  issues: TaskStateSchemaIssue[],
  mode: 'load' | 'save',
): TaskTransitionRecord | undefined {
  const issueCountBeforeTransition = issues.length;
  if (!isRecord(candidate)) {
    issues.push(issue(transitionPath, 'Task transition must be an object.'));
    return undefined;
  }

  for (const key of Object.keys(candidate)) {
    if (!TASK_TRANSITION_KEYS.has(key)) {
      issues.push(issue(`${transitionPath}.${key}`, 'Unknown task-transition field.'));
    }
  }

  const timestamp = validateTaskTimestamp(candidate.timestamp, `${transitionPath}.timestamp`, issues);
  const from = candidate.from;
  if (!isTaskStatus(from)) {
    issues.push(issue(`${transitionPath}.from`, 'Transition from-state is not supported.'));
  }
  const to = candidate.to;
  if (!isTaskStatus(to)) {
    issues.push(issue(`${transitionPath}.to`, 'Transition to-state is not supported.'));
  }
  const reason = normalizeTaskText(
    candidate.reason,
    `${transitionPath}.reason`,
    'Transition reason must be a non-empty string.',
    issues,
    mode,
  );
  const evidenceReferences = validateEvidenceReferences(
    candidate.evidenceReferences,
    `${transitionPath}.evidenceReferences`,
    issues,
    mode,
  );
  const approvedDecisionId = candidate.approvedDecisionId === undefined
    ? undefined
    : normalizeTaskText(
        candidate.approvedDecisionId,
        `${transitionPath}.approvedDecisionId`,
        'approvedDecisionId must be a non-empty string when present.',
        issues,
        mode,
      );

  if (
    issues.length !== issueCountBeforeTransition ||
    !timestamp ||
    !isTaskStatus(from) ||
    !isTaskStatus(to) ||
    !reason ||
    !evidenceReferences
  ) {
    return undefined;
  }

  return {
    timestamp,
    from,
    to,
    reason,
    evidenceReferences,
    ...(approvedDecisionId ? { approvedDecisionId } : {}),
  };
}

function validateEvidenceReferences(
  candidate: unknown,
  fieldPath: string,
  issues: TaskStateSchemaIssue[],
  mode: 'load' | 'save',
): string[] | undefined {
  if (!Array.isArray(candidate)) {
    issues.push(issue(fieldPath, 'evidenceReferences must be an array.'));
    return undefined;
  }

  const references: string[] = [];
  for (const [index, referenceCandidate] of candidate.entries()) {
    const reference = normalizeTaskText(
      referenceCandidate,
      `${fieldPath}[${index}]`,
      'Evidence references must be non-empty strings.',
      issues,
      mode,
    );
    if (reference) references.push(reference);
  }
  return references;
}

function normalizeTaskText(
  candidate: unknown,
  fieldPath: string,
  message: string,
  issues: TaskStateSchemaIssue[],
  mode: 'load' | 'save',
): string | undefined {
  if (typeof candidate !== 'string' || candidate.trim().length === 0 || candidate.trim().length > 500) {
    issues.push(issue(fieldPath, message));
    return undefined;
  }

  const normalized = candidate.trim();
  if (mode === 'load' && normalized !== candidate) {
    issues.push(issue(fieldPath, `${message} Surrounding whitespace is not allowed.`));
    return undefined;
  }
  return normalized;
}

function validateTaskTimestamp(
  candidate: unknown,
  fieldPath: string,
  issues: TaskStateSchemaIssue[],
): string | undefined {
  if (typeof candidate !== 'string' || !isCanonicalTimestamp(candidate)) {
    issues.push(issue(fieldPath, 'Task timestamps must be canonical ISO-8601 UTC values.'));
    return undefined;
  }
  return candidate;
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(field: string, message: string): TaskStateSchemaIssue {
  return { field, message };
}
