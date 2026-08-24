export type GuardianDecision =
  | 'PASS'
  | 'WARNING'
  | 'REPAIR_REQUIRED'
  | 'ARCHITECTURE_REVIEW_REQUIRED'
  | 'BLOCKED';

export const PROJECT_STATE_SCHEMA_VERSION = 1 as const;

export type ProjectVerificationStatus = 'NOT_RUN' | 'PASSED' | 'FAILED';

export interface ProjectVerificationSummary {
  status: ProjectVerificationStatus;
  summary: string;
}

export interface ProjectState {
  schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION;
  projectId: string;
  currentMilestone?: string;
  currentTaskId?: string;
  activeBranch?: string;
  activeWorktree?: string;
  workerSessionId?: string;
  lastCheckpoint?: string;
  verification: ProjectVerificationSummary;
  updatedAt: string;
}

export interface ProjectStateInput {
  schemaVersion?: number;
  projectId: string;
  currentMilestone?: string;
  currentTaskId?: string;
  activeBranch?: string;
  activeWorktree?: string;
  workerSessionId?: string;
  lastCheckpoint?: string;
  verification: ProjectVerificationSummary;
  updatedAt?: string;
}

export interface TaskDefinition {
  id: string;
  title: string;
  milestone: string;
  objective: string;
  acceptanceCriteria: string[];
  relatedInvariantIds: string[];
  relatedDecisionIds: string[];
  allowedPaths?: string[];
  forbiddenPaths?: string[];
}

export interface ChangeSet {
  taskId: string;
  changedFiles: string[];
  diffSummary: string;
  changedSymbols?: string[];
}

export interface VerificationResult {
  name: string;
  passed: boolean;
  summary: string;
  evidence?: string[];
}

export interface GuardianReport {
  decision: GuardianDecision;
  reasons: string[];
  violatedInvariantIds: string[];
  verification: VerificationResult[];
  recommendedActions: string[];
}

export interface TaskCapsule {
  task: TaskDefinition;
  relevantRules: string[];
  relevantInvariants: string[];
  relevantArchitecture: string[];
  relevantSourceSymbols: string[];
  constraints: string[];
}
