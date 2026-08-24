import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProjectStateInput } from '../src/domain/types.js';
import { ProjectStateError, ProjectStateStore } from '../src/core/project-state-store.js';

const tempRoots: string[] = [];

test.afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('M1.2 creates a valid versioned project state', async () => {
  const root = await createStateFixture();
  const store = new ProjectStateStore(root, { now: fixedClock('2026-08-24T08:00:00.000Z') });

  const saved = await store.save(createStateInput());
  const persisted = JSON.parse(await readFile(store.stateFilePath, 'utf8')) as unknown;

  assert.deepEqual(saved, {
    schemaVersion: 1,
    ...createStateInput(),
    updatedAt: '2026-08-24T08:00:00.000Z',
  });
  assert.deepEqual(persisted, saved);
});

test('M1.2 restores identical state through a fresh service instance', async () => {
  const root = await createStateFixture();
  const firstService = new ProjectStateStore(root, {
    now: fixedClock('2026-08-24T08:01:00.000Z'),
  });
  const saved = await firstService.save(createStateInput());

  const restartedService = new ProjectStateStore(root);
  const restored = await restartedService.load();

  assert.deepEqual(restored, saved);
});

test('M1.2 atomically updates existing state', async () => {
  const root = await createStateFixture();
  const timestamps = ['2026-08-24T08:02:00.000Z', '2026-08-24T08:03:00.000Z'];
  const store = new ProjectStateStore(root, {
    now: () => new Date(timestamps.shift() ?? '2026-08-24T08:03:00.000Z'),
  });
  await store.save(createStateInput());

  const updated = await store.update((current) => ({
    ...current,
    currentTaskId: 'M1.2-T2',
    lastCheckpoint: '2222222222222222222222222222222222222222',
    verification: { status: 'PASSED', summary: 'All deterministic checks passed.' },
  }));

  assert.equal(updated.currentTaskId, 'M1.2-T2');
  assert.equal(updated.updatedAt, '2026-08-24T08:03:00.000Z');
  assert.deepEqual(await store.load(), updated);
});

test('M1.2 rejects malformed JSON without modifying it', async () => {
  const root = await createStateFixture();
  const store = new ProjectStateStore(root);
  const malformed = '{"projectId":"mentor-ai-ann",broken';
  await writeFile(store.stateFilePath, malformed, 'utf8');

  await assert.rejects(
    () => store.load(),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_JSON_INVALID');
      return true;
    },
  );
  assert.equal(await readFile(store.stateFilePath, 'utf8'), malformed);
});

test('M1.2 validates the complete state schema on read', async () => {
  const root = await createStateFixture();
  const store = new ProjectStateStore(root);
  const invalidState = JSON.stringify({
    schemaVersion: 1,
    projectId: 'mentor-ai-ann',
    verification: { status: 'NOT_RUN', summary: 'Verification has not run yet.' },
    updatedAt: '2026-08-24T08:03:30.000Z',
    unexpected: 'not part of schema V1',
  });
  await writeFile(store.stateFilePath, invalidState, 'utf8');

  await assert.rejects(
    () => store.load(),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_SCHEMA_INVALID');
      assert.equal(error.issues[0]?.field, '$.unexpected');
      return true;
    },
  );
  assert.equal(await readFile(store.stateFilePath, 'utf8'), invalidState);
});

test('M1.2 preserves the previous state when atomic replacement fails', async () => {
  const root = await createStateFixture();
  const initialStore = new ProjectStateStore(root, {
    now: fixedClock('2026-08-24T08:04:00.000Z'),
  });
  await initialStore.save(createStateInput());
  const previousState = await readFile(initialStore.stateFilePath, 'utf8');

  const failingStore = new ProjectStateStore(root, {
    now: fixedClock('2026-08-24T08:05:00.000Z'),
    createTemporaryId: () => 'simulated-interruption',
    io: {
      async replaceFile() {
        throw Object.assign(new Error('simulated replace failure'), { code: 'EIO' });
      },
    },
  });

  await assert.rejects(
    () =>
      failingStore.update((current) => ({
        ...current,
        currentTaskId: 'M1.2-INTERRUPTED',
      })),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_WRITE_FAILED');
      return true;
    },
  );

  assert.equal(await readFile(initialStore.stateFilePath, 'utf8'), previousState);
  assert.deepEqual(
    (await readdir(join(root, '.ann'))).filter((name) => name.endsWith('.tmp')),
    [],
  );
});

test('M1.2 rejects secret-like fields before writing state', async () => {
  const root = await createStateFixture();
  const store = new ProjectStateStore(root);
  const candidate = {
    ...createStateInput(),
    apiKey: 'test-only-value',
  } as unknown as ProjectStateInput;

  await assert.rejects(
    () => store.save(candidate),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_SECRET_REJECTED');
      assert.equal(error.issues[0]?.field, '$.apiKey');
      assert.doesNotMatch(error.message, /test-only-value/);
      return true;
    },
  );

  const candidateWithCredentialText: ProjectStateInput = {
    ...createStateInput(),
    verification: {
      status: 'FAILED',
      summary: ['Authorization:', 'Bearer', 'test-only-value'].join(' '),
    },
  };
  await assert.rejects(
    () => store.save(candidateWithCredentialText),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_SECRET_REJECTED');
      assert.equal(error.issues[0]?.field, '$.verification.summary');
      assert.doesNotMatch(error.message, /test-only-value/);
      return true;
    },
  );
  assert.equal(await store.load(), undefined);
});

test('M1.2 fails safely on an unknown future schema version', async () => {
  const root = await createStateFixture();
  const store = new ProjectStateStore(root);
  const futureState = JSON.stringify({
    schemaVersion: 2,
    ...createStateInput(),
    updatedAt: '2026-08-24T08:06:00.000Z',
  });
  await writeFile(store.stateFilePath, futureState, 'utf8');

  await assert.rejects(
    () => store.load(),
    (error: unknown) => {
      assert.ok(error instanceof ProjectStateError);
      assert.equal(error.code, 'STATE_VERSION_UNSUPPORTED');
      return true;
    },
  );
  assert.equal(await readFile(store.stateFilePath, 'utf8'), futureState);
});

function createStateInput(): ProjectStateInput {
  return {
    projectId: 'mentor-ai-ann',
    currentMilestone: 'M1',
    currentTaskId: 'M1.2',
    activeBranch: 'feat/m1-2-project-state',
    activeWorktree: 'C:\\workspace with spaces\\mentor-ai',
    workerSessionId: 'worker-session-01',
    lastCheckpoint: '1111111111111111111111111111111111111111',
    verification: { status: 'NOT_RUN', summary: 'Verification has not run yet.' },
  };
}

async function createStateFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ann-project-state-'));
  tempRoots.push(root);
  await mkdir(join(root, '.ann'), { recursive: true });
  return root;
}

function fixedClock(timestamp: string): () => Date {
  return () => new Date(timestamp);
}
