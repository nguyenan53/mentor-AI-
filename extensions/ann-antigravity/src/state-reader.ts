import { readFile } from "node:fs/promises";
import path from "node:path";

export type ProjectStateReadStatus = "valid" | "missing" | "malformed" | "unavailable";
export type VerificationDisplayStatus = "PASSED" | "FAILED" | "NOT_RUN" | "UNKNOWN";

export interface ProjectStateDisplay {
  readonly status: ProjectStateReadStatus;
  readonly statePath: string;
  readonly projectName: string;
  readonly milestone: string;
  readonly task: string;
  readonly activeBranch?: string;
  readonly verification: VerificationDisplayStatus;
  readonly verificationSummary?: string;
  readonly updatedAt?: string;
  readonly message?: string;
}

export type ReadTextFile = (filePath: string, encoding: BufferEncoding) => Promise<string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : fallback;
}

function optionalDisplayString(value: unknown): string | undefined {
  const displayed = displayString(value, "");
  return displayed || undefined;
}

function verificationStatus(value: unknown): VerificationDisplayStatus {
  return value === "PASSED" || value === "FAILED" || value === "NOT_RUN" ? value : "UNKNOWN";
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

async function readProjectNameFallback(projectRoot: string, readTextFile: ReadTextFile): Promise<string> {
  try {
    const packageText = await readTextFile(path.join(projectRoot, "package.json"), "utf8");
    const packageJson: unknown = JSON.parse(packageText);
    if (isRecord(packageJson)) {
      return displayString(packageJson.name, path.basename(projectRoot));
    }
  } catch {
    // package.json is an optional project-name fallback only.
  }

  return path.basename(projectRoot);
}

export async function readProjectState(
  projectRoot: string,
  readTextFile: ReadTextFile = readFile,
): Promise<ProjectStateDisplay> {
  const statePath = path.join(projectRoot, ".ann", "PROJECT_STATE.json");
  const fallbackName = await readProjectNameFallback(projectRoot, readTextFile);
  let stateText: string;

  try {
    stateText = await readTextFile(statePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return {
        status: "missing",
        statePath,
        projectName: fallbackName,
        milestone: "unknown",
        task: "unknown",
        verification: "UNKNOWN",
        message: "state not initialized",
      };
    }

    return {
      status: "unavailable",
      statePath,
      projectName: fallbackName,
      milestone: "unknown",
      task: "unknown",
      verification: "UNKNOWN",
      message: "state unavailable",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stateText);
  } catch {
    return {
      status: "malformed",
      statePath,
      projectName: fallbackName,
      milestone: "unknown",
      task: "unknown",
      verification: "UNKNOWN",
      message: "state malformed",
    };
  }

  if (!isRecord(parsed)) {
    return {
      status: "malformed",
      statePath,
      projectName: fallbackName,
      milestone: "unknown",
      task: "unknown",
      verification: "UNKNOWN",
      message: "state malformed",
    };
  }

  const verification = isRecord(parsed.verification) ? parsed.verification : undefined;
  return {
    status: "valid",
    statePath,
    projectName: displayString(parsed.projectId, fallbackName),
    milestone: displayString(parsed.currentMilestone, "unknown"),
    task: displayString(parsed.currentTaskId, "unknown"),
    activeBranch: optionalDisplayString(parsed.activeBranch),
    verification: verificationStatus(verification?.status),
    verificationSummary: optionalDisplayString(verification?.summary),
    updatedAt: optionalDisplayString(parsed.updatedAt),
  };
}
