import { stat } from "node:fs/promises";
import path from "node:path";

import { ANN_AUTHORITY_MARKER } from "./ann-files";

export type StatFile = (filePath: string) => Promise<{ isFile(): boolean }>;

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function comparisonPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isPathInside(parentPath: string, candidatePath: string): boolean {
  const parent = comparisonPath(parentPath);
  const candidate = comparisonPath(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function containsAnnAuthorityMarker(
  projectRoot: string,
  statFile: StatFile = stat,
): Promise<boolean> {
  try {
    const marker = await statFile(path.join(projectRoot, ...ANN_AUTHORITY_MARKER.split("/")));
    return marker.isFile();
  } catch {
    return false;
  }
}

export async function detectAnnProjectRoots(
  workspaceRoots: readonly string[],
  statFile: StatFile = stat,
): Promise<string[]> {
  const candidates = [...new Set(workspaceRoots.map((root) => path.resolve(root)))];
  const detection = await Promise.all(
    candidates.map(async (root) => ({ root, detected: await containsAnnAuthorityMarker(root, statFile) })),
  );

  return detection
    .filter(({ detected }) => detected)
    .map(({ root }) => root)
    .sort(comparePaths);
}

export function chooseAnnProjectRoot(
  projectRoots: readonly string[],
  activeFilePath?: string,
): string | undefined {
  const ordered = [...new Set(projectRoots.map((root) => path.resolve(root)))].sort(comparePaths);
  if (!activeFilePath) {
    return ordered[0];
  }

  const matchingRoots = ordered.filter((root) => isPathInside(root, activeFilePath));
  matchingRoots.sort((left, right) => right.length - left.length || comparePaths(left, right));
  return matchingRoots[0] ?? ordered[0];
}
