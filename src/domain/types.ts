export type GuardianDecision =
  | 'PASS'
  | 'WARNING'
  | 'REPAIR_REQUIRED'
  | 'ARCHITECTURE_REVIEW_REQUIRED'
  | 'BLOCKED';

export interface ProjectState {
  projectId: string;
  currentMilestone?: string;
  currentTaskId?: string;
  activeBranch?: string;
  activeWorktree?: string;
  workerSessionId?: string;
  updatedAt: string;
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
