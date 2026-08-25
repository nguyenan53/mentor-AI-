import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  chooseAnnProjectRoot,
  containsAnnAuthorityMarker,
  detectAnnProjectRoots,
} from "../src/project-detector";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ann-control-room-test-"));
}

async function addAuthorityMarker(projectRoot: string): Promise<void> {
  const annDirectory = path.join(projectRoot, ".ann");
  await mkdir(annDirectory, { recursive: true });
  await writeFile(path.join(annDirectory, "MASTER_PLAN.md"), "# Plan\n", "utf8");
}

test("detects an ANN workspace containing the authority marker", async () => {
  const projectRoot = await temporaryDirectory();
  await addAuthorityMarker(projectRoot);

  assert.equal(await containsAnnAuthorityMarker(projectRoot), true);
  assert.deepEqual(await detectAnnProjectRoots([projectRoot]), [path.resolve(projectRoot)]);
});

test("does not detect a workspace without the authority marker", async () => {
  const projectRoot = await temporaryDirectory();

  assert.equal(await containsAnnAuthorityMarker(projectRoot), false);
  assert.deepEqual(await detectAnnProjectRoots([projectRoot]), []);
});

test("selects the deepest matching project deterministically in nested multi-root paths", async () => {
  const outer = await temporaryDirectory();
  const inner = path.join(outer, "packages", "inner");
  await mkdir(inner, { recursive: true });
  await addAuthorityMarker(outer);
  await addAuthorityMarker(inner);
  const roots = await detectAnnProjectRoots([inner, outer, outer]);

  assert.equal(chooseAnnProjectRoot(roots, path.join(inner, "src", "index.ts")), path.resolve(inner));
  assert.equal(chooseAnnProjectRoot(roots, path.join(outer, "README.md")), path.resolve(outer));
  assert.equal(chooseAnnProjectRoot([...roots].reverse()), roots[0]);
});
