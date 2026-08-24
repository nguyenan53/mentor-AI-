import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardianEngine } from '../src/guardian/guardian.js';

const baseTask = {
  id: 'M0-T1',
  title: 'Foundation test',
  milestone: 'M0',
  objective: 'Verify Guardian decisions.',
  acceptanceCriteria: ['Deterministic checks pass.'],
  relatedInvariantIds: ['INV-002'],
  relatedDecisionIds: [],
};

test('Guardian passes a clean verified change', () => {
  const report = new GuardianEngine().evaluate({
    task: baseTask,
    changeSet: { taskId: baseTask.id, changedFiles: ['src/example.ts'], diffSummary: '+1 -0' },
    verification: [{ name: 'typecheck', passed: true, summary: 'ok' }],
    protectedPaths: ['.ann/MASTER_PLAN.md', '.ann/CORE_INVARIANTS.yaml'],
  });

  assert.equal(report.decision, 'PASS');
});

test('Guardian blocks protected project truth changes', () => {
  const report = new GuardianEngine().evaluate({
    task: baseTask,
    changeSet: { taskId: baseTask.id, changedFiles: ['.ann/MASTER_PLAN.md'], diffSummary: '+1 -1' },
    verification: [{ name: 'typecheck', passed: true, summary: 'ok' }],
    protectedPaths: ['.ann/MASTER_PLAN.md', '.ann/CORE_INVARIANTS.yaml'],
  });

  assert.equal(report.decision, 'BLOCKED');
  assert.deepEqual(report.violatedInvariantIds, ['INV-002']);
});

test('Guardian requests repair when deterministic checks fail', () => {
  const report = new GuardianEngine().evaluate({
    task: baseTask,
    changeSet: { taskId: baseTask.id, changedFiles: ['src/example.ts'], diffSummary: '+2 -1' },
    verification: [{ name: 'tests', passed: false, summary: '1 failed' }],
    protectedPaths: ['.ann/MASTER_PLAN.md', '.ann/CORE_INVARIANTS.yaml'],
  });

  assert.equal(report.decision, 'REPAIR_REQUIRED');
});
