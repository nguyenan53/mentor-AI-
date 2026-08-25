export const TASK_STATUSES = [
  'CREATED',
  'CONTEXT_READY',
  'ANALYZING',
  'READY_TO_IMPLEMENT',
  'IMPLEMENTING',
  'VERIFYING',
  'REPAIR_REQUIRED',
  'BLOCKED',
  'ESCALATED',
  'COMPLETE',
  'CANCELLED',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskTransitionRecord {
  timestamp: string;
  from: TaskStatus;
  to: TaskStatus;
  reason: string;
  evidenceReferences: string[];
  approvedDecisionId?: string;
}

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  transitions: TaskTransitionRecord[];
}

function transitions(...statuses: TaskStatus[]): readonly TaskStatus[] {
  return Object.freeze(statuses);
}

export const TASK_TRANSITION_TABLE: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = Object.freeze({
  CREATED: transitions('CONTEXT_READY', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  CONTEXT_READY: transitions('ANALYZING', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  ANALYZING: transitions('READY_TO_IMPLEMENT', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  READY_TO_IMPLEMENT: transitions('IMPLEMENTING', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  IMPLEMENTING: transitions('VERIFYING', 'REPAIR_REQUIRED', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  VERIFYING: transitions('COMPLETE', 'REPAIR_REQUIRED', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  REPAIR_REQUIRED: transitions('ANALYZING', 'IMPLEMENTING', 'BLOCKED', 'ESCALATED', 'CANCELLED'),
  BLOCKED: transitions('CONTEXT_READY', 'ANALYZING', 'READY_TO_IMPLEMENT', 'ESCALATED', 'CANCELLED'),
  ESCALATED: transitions('CONTEXT_READY', 'ANALYZING', 'READY_TO_IMPLEMENT', 'BLOCKED', 'CANCELLED'),
  COMPLETE: transitions(),
  CANCELLED: transitions(),
});

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);
const TERMINAL_TASK_STATUS_SET = new Set<TaskStatus>(['COMPLETE', 'CANCELLED']);
const APPROVAL_SENSITIVE_TASK_STATUS_SET = new Set<TaskStatus>(['BLOCKED', 'ESCALATED']);
const NON_RESUMING_TASK_STATUS_SET = new Set<TaskStatus>(['BLOCKED', 'ESCALATED', 'CANCELLED']);

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUS_SET.has(value);
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUS_SET.has(status);
}

export function isTaskTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITION_TABLE[from].includes(to);
}

export function taskResumeRequiresApprovedDecision(from: TaskStatus, to: TaskStatus): boolean {
  return APPROVAL_SENSITIVE_TASK_STATUS_SET.has(from) && !NON_RESUMING_TASK_STATUS_SET.has(to);
}
