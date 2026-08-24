import type {
  ChangeSet,
  GuardianReport,
  TaskDefinition,
  VerificationResult,
} from '../domain/types.js';

export interface GuardianContext {
  task: TaskDefinition;
  changeSet: ChangeSet;
  verification: VerificationResult[];
  protectedPaths: string[];
}

export class GuardianEngine {
  evaluate(context: GuardianContext): GuardianReport {
    const reasons: string[] = [];
    const violatedInvariantIds: string[] = [];
    const recommendedActions: string[] = [];

    const protectedChange = context.changeSet.changedFiles.find((path) =>
      context.protectedPaths.some((protectedPath) => path === protectedPath),
    );

    if (protectedChange) {
      reasons.push(`Protected project-truth file changed: ${protectedChange}`);
      violatedInvariantIds.push('INV-002');
      recommendedActions.push('Revert protected-file changes and create an explicit governance proposal.');
    }

    const forbiddenChange = context.changeSet.changedFiles.find((path) =>
      context.task.forbiddenPaths?.some((forbidden) => path.startsWith(forbidden)),
    );

    if (forbiddenChange) {
      reasons.push(`Task modified forbidden path: ${forbiddenChange}`);
      recommendedActions.push('Revert out-of-scope changes and constrain the worker task capsule.');
    }

    const failedChecks = context.verification.filter((result) => !result.passed);
    if (failedChecks.length > 0) {
      reasons.push(`Deterministic verification failed: ${failedChecks.map((item) => item.name).join(', ')}`);
      recommendedActions.push('Repair failing deterministic checks before semantic or premium-model escalation.');
    }

    if (violatedInvariantIds.length > 0 || forbiddenChange) {
      return {
        decision: 'BLOCKED',
        reasons,
        violatedInvariantIds,
        verification: context.verification,
        recommendedActions,
      };
    }

    if (failedChecks.length > 0) {
      return {
        decision: 'REPAIR_REQUIRED',
        reasons,
        violatedInvariantIds,
        verification: context.verification,
        recommendedActions,
      };
    }

    return {
      decision: 'PASS',
      reasons: reasons.length > 0 ? reasons : ['No blocking rule or deterministic verification failure detected.'],
      violatedInvariantIds,
      verification: context.verification,
      recommendedActions,
    };
  }
}
