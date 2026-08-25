import { readFile } from "node:fs/promises";
import path from "node:path";

export type ProjectStateReadStatus = "valid" | "missing" | "malformed" | "unavailable";
export type VerificationDisplayStatus = "PASSED" | "FAILED" | "NOT_RUN" | "UNAVAILABLE";

export interface ProjectStateDisplay {
  readonly status: ProjectStateReadStatus;
  readonly statePath: string;
  readonly projectName: string;
  readonly milestone: string;
  readonly task: string;
  readonly taskStatus?: string;
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
  return value === "PASSED" || value === "FAILED" || value === "NOT_RUN" ? value : "UNAVAILABLE";
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
        milestone: "Not set — initialize through ANN Core",
        task: "No current task — initialize through ANN Core",
        verification: "UNAVAILABLE",
        message: "State not initialized — initialize PROJECT_STATE.json through ANN Core.",
      };
    }

    return {
      status: "unavailable",
      statePath,
      projectName: fallbackName,
      milestone: "Unavailable — inspect through ANN Core",
      task: "Unavailable — inspect through ANN Core",
      verification: "UNAVAILABLE",
      message: "State unavailable — inspect PROJECT_STATE.json through ANN Core.",
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
      milestone: "Unavailable — repair through ANN Core",
      task: "Unavailable — repair through ANN Core",
      verification: "UNAVAILABLE",
      message: "State malformed — repair PROJECT_STATE.json through ANN Core.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      status: "malformed",
      statePath,
      projectName: fallbackName,
      milestone: "Unavailable — repair through ANN Core",
      task: "Unavailable — repair through ANN Core",
      verification: "UNAVAILABLE",
      message: "State malformed — repair PROJECT_STATE.json through ANN Core.",
    };
  }

  const verification = isRecord(parsed.verification) ? parsed.verification : undefined;
  const currentTaskId = optionalDisplayString(parsed.currentTaskId);
  const taskStates = isRecord(parsed.taskStates) ? parsed.taskStates : undefined;
  const currentTask = currentTaskId && isRecord(taskStates?.[currentTaskId])
    ? taskStates[currentTaskId]
    : undefined;
  return {
    status: "valid",
    statePath,
    projectName: displayString(parsed.projectId, fallbackName),
    milestone: displayString(parsed.currentMilestone, "Not set — select through ANN Core"),
    task: currentTaskId ?? "No current task — select through ANN Core",
    taskStatus: optionalDisplayString(currentTask?.status),
    activeBranch: optionalDisplayString(parsed.activeBranch),
    verification: verificationStatus(verification?.status),
    verificationSummary: optionalDisplayString(verification?.summary),
    updatedAt: optionalDisplayString(parsed.updatedAt),
  };
}
