import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GOVERNANCE_FILES } from "../src/ann-files";
import { readProjectState } from "../src/state-reader";

async function temporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ann-state-reader-test-"));
  await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ name: "fallback-project" }), "utf8");
  return projectRoot;
}

async function statePath(projectRoot: string): Promise<string> {
  const annDirectory = path.join(projectRoot, ".ann");
  await mkdir(annDirectory, { recursive: true });
  return path.join(annDirectory, "PROJECT_STATE.json");
}

test("reads valid project state for display", async () => {
  const projectRoot = await temporaryProject();
  const filePath = await statePath(projectRoot);
  await writeFile(filePath, JSON.stringify({
    projectId: "mentor-ai-ann",
    currentMilestone: "M1",
    currentTaskId: "M1.3",
    activeBranch: "feat/example",
    verification: { status: "PASSED", summary: "all deterministic checks passed" },
    updatedAt: "2026-08-24T00:00:00.000Z",
  }), "utf8");

  const state = await readProjectState(projectRoot);
  assert.equal(state.status, "valid");
  assert.equal(state.projectName, "mentor-ai-ann");
  assert.equal(state.milestone, "M1");
  assert.equal(state.task, "M1.3");
  assert.equal(state.activeBranch, "feat/example");
  assert.equal(state.verification, "PASSED");
});

test("handles missing state without creating it", async () => {
  const projectRoot = await temporaryProject();
  const missingPath = path.join(projectRoot, ".ann", "PROJECT_STATE.json");
  const state = await readProjectState(projectRoot);

  assert.equal(state.status, "missing");
  assert.equal(state.projectName, "fallback-project");
  await assert.rejects(access(missingPath));
});

test("handles malformed state without modifying it", async () => {
  const projectRoot = await temporaryProject();
  const filePath = await statePath(projectRoot);
  const malformed = "{ definitely-not-json\n";
  await writeFile(filePath, malformed, "utf8");

  const state = await readProjectState(projectRoot);
  assert.equal(state.status, "malformed");
  assert.equal(await readFile(filePath, "utf8"), malformed);
});

test("treats governance files as immutable read-only descriptors", () => {
  assert.deepEqual(
    GOVERNANCE_FILES.map((file) => file.relativePath),
    [
      ".ann/MASTER_PLAN.md",
      ".ann/RULES.md",
      ".ann/CORE_INVARIANTS.yaml",
      ".ann/ARCHITECTURE.md",
    ],
  );
  assert.equal(GOVERNANCE_FILES.every((file) => file.readOnly && file.governance), true);
  assert.equal(Object.isFrozen(GOVERNANCE_FILES), true);
  assert.equal(GOVERNANCE_FILES.every((file) => Object.isFrozen(file)), true);
});
