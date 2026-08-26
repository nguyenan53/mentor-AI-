import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectProjectRoot } from "../src/project-root-status";

test("detects ready and missing Master Plan roots without writing project data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ann-ux05-root-"));
  const before = await readdir(root);
  const missing = await inspectProjectRoot(root);

  assert.equal(missing.status, "missing-master-plan");
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(access(path.join(root, ".ann")));

  await mkdir(path.join(root, ".ann"));
  const markerPath = path.join(root, ".ann", "MASTER_PLAN.md");
  await writeFile(markerPath, "# Existing authority\n", "utf8");
  const ready = await inspectProjectRoot(root);

  assert.equal(ready.status, "ready");
  assert.equal(await readFile(markerPath, "utf8"), "# Existing authority\n");
});

test("makes missing project roots actionable", async () => {
  const missingRoot = path.join(os.tmpdir(), `ann-ux05-missing-${Date.now()}`);
  const inspection = await inspectProjectRoot(missingRoot);

  assert.equal(inspection.status, "missing-root");
  assert.match(inspection.masterPlanLabel, /missing/i);
});
