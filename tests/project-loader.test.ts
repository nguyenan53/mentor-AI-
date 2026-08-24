import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadProject, ProjectLoadError } from '../src/core/project-loader.js';
import { ProjectStateStore } from '../src/core/project-state-store.js';

const tempRoots: string[] = [];

test.afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('M1.1 loads a valid project from a nested workspace path', async () => {
  const root = await createFixture();
  const nested = join(root, 'src', 'feature');
  await mkdir(nested, { recursive: true });

  const project = await loadProject(nested);

  assert.equal(project.projectId, 'mentor-ai-ann');
  assert.equal(project.projectIdSource, 'package');
  assert.equal(project.repository.rootPath, root);
  assert.equal(project.repository.gitMarkerKind, 'directory');
  assert.equal(Object.keys(project.authority).length, 4);
  assert.match(project.authority['.ann/MASTER_PLAN.md'].sha256, /^[a-f0-9]{64}$/);
});

test('M1.1 returns a structured error when .ann is missing', async () => {
  const root = await createBareRepository();

  await assert.rejects(
    () => loadProject(root),
    (error: unknown) => {
      assert.ok(error instanceof ProjectLoadError);
      assert.equal(error.code, 'ANN_DIRECTORY_MISSING');
      return true;
    },
  );
});

test('M1.1 rejects structurally invalid authority files with evidence', async () => {
  const root = await createFixture();
  const rulesPath = join(root, '.ann', 'RULES.md');
  await writeFile(rulesPath, '# wrong document\n', 'utf8');

  await assert.rejects(
    () => loadProject(root),
    (error: unknown) => {
      assert.ok(error instanceof ProjectLoadError);
      assert.equal(error.code, 'AUTHORITY_VALIDATION_FAILED');
      assert.equal(error.issues.length, 1);
      assert.equal(error.issues[0]?.code, 'AUTHORITY_FILE_INVALID');
      assert.equal(error.issues[0]?.path, rulesPath);
      return true;
    },
  );
});

test('M1.1 malformed project state is never overwritten or repaired implicitly', async () => {
  const root = await createFixture();
  const statePath = join(root, '.ann', 'PROJECT_STATE.json');
  const malformedState = '{"projectId": "mentor-ai", broken';
  await writeFile(statePath, malformedState, 'utf8');

  await assert.rejects(
    () => loadProject(root),
    (error: unknown) => {
      assert.ok(error instanceof ProjectLoadError);
      assert.equal(error.code, 'STATE_MALFORMED');
      assert.equal(error.issues[0]?.code, 'STATE_JSON_INVALID');
      return true;
    },
  );

  assert.equal(await readFile(statePath, 'utf8'), malformedState);
});

test('M1.2 Project Loader resolves project identity through the validated state store', async () => {
  const root = await createFixture();
  const store = new ProjectStateStore(root, {
    now: () => new Date('2026-08-24T08:07:00.000Z'),
  });
  await store.save({
    projectId: 'state-owned-project',
    currentMilestone: 'M1',
    currentTaskId: 'M1.2',
    verification: { status: 'NOT_RUN', summary: 'Verification has not run yet.' },
  });

  const project = await loadProject(root);

  assert.equal(project.projectId, 'state-owned-project');
  assert.equal(project.projectIdSource, 'state');
  assert.equal(project.stateFilePath, store.stateFilePath);
});

async function createBareRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ann-project-loader-'));
  tempRoots.push(root);
  await mkdir(join(root, '.git'));
  return root;
}

async function createFixture(): Promise<string> {
  const root = await createBareRepository();
  const ann = join(root, '.ann');
  await mkdir(ann, { recursive: true });

  await Promise.all([
    writeFile(
      join(ann, 'MASTER_PLAN.md'),
      '# ANN Master Plan\n\n## Mission\nfixture\n\n## Authority order\n1. User intent\n',
      'utf8',
    ),
    writeFile(
      join(ann, 'RULES.md'),
      '# ANN Rules\n\n## R-001 Authority\nWorkers obey authority.\n',
      'utf8',
    ),
    writeFile(
      join(ann, 'CORE_INVARIANTS.yaml'),
      'project: fixture\ninvariants:\n  - id: INV-001\n    severity: critical\n    statement: fixture\n',
      'utf8',
    ),
    writeFile(
      join(ann, 'ARCHITECTURE.md'),
      '# ANN Architecture\n\n## Guardian\nGuardian remains authoritative.\n',
      'utf8',
    ),
    writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'mentor-ai-ann' }),
      'utf8',
    ),
  ]);

  return root;
}
