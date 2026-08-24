import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TaskStatus } from '../src/domain/task-state.js';
import { ProjectStateError, ProjectStateStore } from '../src/core/project-state-store.js';
import { TaskStateMachine, TaskStateMachineError } from '../src/core/task-state-machine.js';

const tempRoots: string[] = [];

test.afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('M1.3 completes the valid deterministic task lifecycle with transition evidence', async () => {
  const fixture = await createFixture();
  const task = await fixture.machine.createTask('M1.3-T1');
  assert.equal(task.status, 'CREATED');
  assert.deepEqual(task.transitions, []);

  for (const status of [
    'CONTEXT_READY',
    'ANALYZING',
    'READY_TO_IMPLEMENT',
    'IMPLEMENTING',
    'VERIFYING',
    'COMPLETE',
  ] satisfies TaskStatus[]) {
    await transition(fixture.machine, task.taskId, status);
  }

  const completed = await fixture.machine.loadTask(task.taskId);
  assert.ok(completed);
  assert.equal(completed.status, 'COMPLETE');
  assert.equal(completed.transitions.length, 6);
  assert.deepEqual(completed.transitions[0], {
    timestamp: '2026-08-24T10:00:01.000Z',
    from: 'CREATED',
    to: 'CONTEXT_READY',
    reason: 'Advance task to CONTEXT_READY.',
    evidenceReferences: ['issue:#3', 'test:valid-lifecycle'],
  });

  const persistedProject = await fixture.store.load();
  assert.deepEqual(persistedProject?.taskStates?.[task.taskId], completed);
  assert.equal(persistedProject?.currentTaskId, task.taskId);
});

test('M1.3 rejects invalid transitions with a structured error and no persisted change', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T2');
  const before = await readFile(fixture.store.stateFilePath, 'utf8');

  await assert.rejects(
    () => transition(fixture.machine, 'M1.3-T2', 'IMPLEMENTING'),
    (error: unknown) => {
      assert.ok(error instanceof TaskStateMachineError);
      assert.equal(error.code, 'TASK_TRANSITION_INVALID');
      assert.equal(error.taskId, 'M1.3-T2');
      assert.equal(error.from, 'CREATED');
      assert.equal(error.to, 'IMPLEMENTING');
      return true;
    },
  );

  assert.equal(await readFile(fixture.store.stateFilePath, 'utf8'), before);
});

test('M1.3 protects COMPLETE and CANCELLED terminal states from silent resume', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T3');
  await advanceToVerification(fixture.machine, 'M1.3-T3');
  await transition(fixture.machine, 'M1.3-T3', 'COMPLETE');

  await assertTerminalRejection(fixture.machine, 'M1.3-T3', 'ANALYZING', 'COMPLETE');

  await fixture.machine.createTask('M1.3-T4');
  await transition(fixture.machine, 'M1.3-T4', 'CANCELLED');
  await assertTerminalRejection(fixture.machine, 'M1.3-T4', 'CONTEXT_READY', 'CANCELLED');
});

test('M1.3 restores identical task state through a fresh M1.2 store and service instance', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T5');
  await transition(fixture.machine, 'M1.3-T5', 'CONTEXT_READY');
  const beforeRestart = await transition(fixture.machine, 'M1.3-T5', 'ANALYZING');

  const restartedStore = new ProjectStateStore(fixture.root);
  const restartedMachine = new TaskStateMachine(restartedStore);
  const restored = await restartedMachine.loadTask('M1.3-T5');

  assert.deepEqual(restored, beforeRestart);
});

test('M1.3 supports an explicit verification repair loop', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T6');
  await advanceToVerification(fixture.machine, 'M1.3-T6');
  await transition(fixture.machine, 'M1.3-T6', 'REPAIR_REQUIRED');
  await transition(fixture.machine, 'M1.3-T6', 'IMPLEMENTING');
  await transition(fixture.machine, 'M1.3-T6', 'VERIFYING');
  const completed = await transition(fixture.machine, 'M1.3-T6', 'COMPLETE');

  assert.equal(completed.status, 'COMPLETE');
  assert.deepEqual(
    completed.transitions.slice(-4).map(({ from, to }) => `${from}->${to}`),
    [
      'VERIFYING->REPAIR_REQUIRED',
      'REPAIR_REQUIRED->IMPLEMENTING',
      'IMPLEMENTING->VERIFYING',
      'VERIFYING->COMPLETE',
    ],
  );
});

test('M1.3 escalation cannot resume toward implementation without an approved decision', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T7');
  await transition(fixture.machine, 'M1.3-T7', 'CONTEXT_READY');
  await transition(fixture.machine, 'M1.3-T7', 'ANALYZING');
  await transition(fixture.machine, 'M1.3-T7', 'ESCALATED');

  await assertApprovalRequired(fixture.machine, 'M1.3-T7', 'READY_TO_IMPLEMENT', 'ESCALATED');
  const resumed = await transition(
    fixture.machine,
    'M1.3-T7',
    'READY_TO_IMPLEMENT',
    'USER-DECISION-001',
  );

  assert.equal(resumed.status, 'READY_TO_IMPLEMENT');
  assert.equal(resumed.transitions.at(-1)?.approvedDecisionId, 'USER-DECISION-001');
  assert.equal((await transition(fixture.machine, 'M1.3-T7', 'IMPLEMENTING')).status, 'IMPLEMENTING');
});

test('M1.3 blocked tasks require an approved decision before resuming', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T8');
  await transition(fixture.machine, 'M1.3-T8', 'BLOCKED');

  await assertApprovalRequired(fixture.machine, 'M1.3-T8', 'CONTEXT_READY', 'BLOCKED');
  const resumed = await transition(fixture.machine, 'M1.3-T8', 'CONTEXT_READY', 'USER-DECISION-002');

  assert.equal(resumed.status, 'CONTEXT_READY');
  assert.equal(resumed.transitions.at(-1)?.approvedDecisionId, 'USER-DECISION-002');
});

test('M1.3 rejects inconsistent persisted transition history without repairing it', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T9');
  const persisted = JSON.parse(await readFile(fixture.store.stateFilePath, 'utf8')) as {
    taskStates: Record<string, { status: string }>;
  };
  persisted.taskStates['M1.3-T9']!.status = 'IMPLEMENTING';
  const malformed = `${JSON.stringify(persisted, null, 2)}\n`;
  await writeFile(fixture.store.stateFilePath, malformed, 'utf8');

  await assert.rejects(
    () => new ProjectStateStore(fixture.root).load(),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_SCHEMA_INVALID');
      assert.ok(error.issues.some((issue) => issue.field === '$.taskStates.M1.3-T9.status'));
      return true;
    },
  );
  assert.equal(await readFile(fixture.store.stateFilePath, 'utf8'), malformed);
});

test('M1.3 rejects credential-like material in task transition records without persisting it', async () => {
  const fixture = await createFixture();
  await fixture.machine.createTask('M1.3-T10');
  const before = await readFile(fixture.store.stateFilePath, 'utf8');

  await assert.rejects(
    () => fixture.machine.transitionTask('M1.3-T10', {
      to: 'CONTEXT_READY',
      reason: 'Authorization: Bearer test-only-value',
      evidenceReferences: ['issue:#3'],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_SECRET_REJECTED');
      assert.doesNotMatch(error.message, /test-only-value/);
      return true;
    },
  );
  assert.equal(await readFile(fixture.store.stateFilePath, 'utf8'), before);
});

interface Fixture {
  root: string;
  store: ProjectStateStore;
  machine: TaskStateMachine;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'ann-task-state-'));
  tempRoots.push(root);
  await mkdir(join(root, '.ann'), { recursive: true });
  const store = new ProjectStateStore(root, {
    now: () => new Date('2026-08-24T09:00:00.000Z'),
  });
  await store.save({
    projectId: 'mentor-ai-ann',
    currentMilestone: 'M1',
    verification: { status: 'NOT_RUN', summary: 'Verification has not run yet.' },
  });
  return {
    root,
    store,
    machine: new TaskStateMachine(store, { now: incrementingClock('2026-08-24T10:00:00.000Z') }),
  };
}

async function transition(
  machine: TaskStateMachine,
  taskId: string,
  to: TaskStatus,
  approvedDecisionId?: string,
) {
  return await machine.transitionTask(taskId, {
    to,
    reason: `Advance task to ${to}.`,
    evidenceReferences: ['issue:#3', 'test:valid-lifecycle'],
    ...(approvedDecisionId ? { approvedDecisionId } : {}),
  });
}

async function advanceToVerification(machine: TaskStateMachine, taskId: string): Promise<void> {
  for (const status of [
    'CONTEXT_READY',
    'ANALYZING',
    'READY_TO_IMPLEMENT',
    'IMPLEMENTING',
    'VERIFYING',
  ] satisfies TaskStatus[]) {
    await transition(machine, taskId, status);
  }
}

async function assertTerminalRejection(
  machine: TaskStateMachine,
  taskId: string,
  to: TaskStatus,
  terminalState: TaskStatus,
): Promise<void> {
  await assert.rejects(
    () => transition(machine, taskId, to),
    (error: unknown) => {
      assert.ok(error instanceof TaskStateMachineError);
      assert.equal(error.code, 'TASK_TERMINAL');
      assert.equal(error.from, terminalState);
      return true;
    },
  );
  assert.equal((await machine.loadTask(taskId))?.status, terminalState);
}

async function assertApprovalRequired(
  machine: TaskStateMachine,
  taskId: string,
  to: TaskStatus,
  from: TaskStatus,
): Promise<void> {
  await assert.rejects(
    () => transition(machine, taskId, to),
    (error: unknown) => {
      assert.ok(error instanceof TaskStateMachineError);
      assert.equal(error.code, 'TASK_APPROVAL_REQUIRED');
      assert.equal(error.from, from);
      assert.equal(error.to, to);
      return true;
    },
  );
  assert.equal((await machine.loadTask(taskId))?.status, from);
}

function incrementingClock(startTimestamp: string): () => Date {
  const start = new Date(startTimestamp).getTime();
  let offsetSeconds = 0;
  return () => new Date(start + offsetSeconds++ * 1_000);
}
