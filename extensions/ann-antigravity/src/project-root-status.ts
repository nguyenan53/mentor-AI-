import { stat } from "node:fs/promises";
import path from "node:path";

import { ANN_AUTHORITY_MARKER } from "./ann-files";

export type ProjectRootStatus = "ready" | "missing-master-plan" | "missing-root" | "unavailable";

export interface ProjectRootInspection {
  readonly status: ProjectRootStatus;
  readonly masterPlanLabel: string;
}

export type InspectStat = (filePath: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function inspectProjectRoot(
  projectRoot: string,
  statFile: InspectStat = stat,
): Promise<ProjectRootInspection> {
  try {
    const root = await statFile(projectRoot);
    if (!root.isDirectory()) {
      return { status: "missing-root", masterPlanLabel: "Project root is not a folder" };
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { status: "missing-root", masterPlanLabel: "Project root is missing — choose another folder" };
    }
    return { status: "unavailable", masterPlanLabel: "Project root is unavailable — check access" };
  }

  try {
    const marker = await statFile(path.join(projectRoot, ...ANN_AUTHORITY_MARKER.split("/")));
    if (marker.isFile()) return { status: "ready", masterPlanLabel: "Ready" };
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      return { status: "unavailable", masterPlanLabel: "Master Plan is unavailable — check access" };
    }
  }

  return {
    status: "missing-master-plan",
    masterPlanLabel: "Missing — initialization is not available in UX1",
  };
}
