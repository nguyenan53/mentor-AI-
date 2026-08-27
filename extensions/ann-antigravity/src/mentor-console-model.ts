import path from "node:path";

import {
  gptAccountById,
  projectRootIdentity,
  type PathFlavor,
} from "./local-workspace";
import { containsCredentialLikeText } from "./user-settings";
import { currentChatGptProject, type ControlRoomSnapshot } from "./view-model";

export type MentorPlanStatus = "READY" | "MISSING" | "NOT AVAILABLE YET";

export interface MentorConsoleContext {
  readonly projectKey: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly localUser: string;
  readonly gptAccountLabel: string;
  readonly gptAccountState: string;
  readonly chatGptProjectLabel: string;
  readonly chatGptProjectState: string;
  readonly masterPlanStatus: MentorPlanStatus;
  readonly masterPlanPath: string;
  readonly projectState: string;
  readonly milestone: string;
  readonly task: string;
  readonly taskStatus: string;
  readonly repository: string;
  readonly branch: string;
  readonly terminalReadiness: string;
}

const UNSAFE_TERMINAL_TEXT = /[\p{Cc}\p{Cf}]/gu;

export function sanitizeTerminalLine(
  value: unknown,
  fallback = "Not available yet",
  maxLength = 500,
): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .normalize("NFKC")
    .replace(UNSAFE_TERMINAL_TEXT, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (containsCredentialLikeText(cleaned)) return "[redacted]";
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function inferPathFlavor(value: string): PathFlavor {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value) ? "win32" : "posix";
}

function matchingRootIdentity(left: string, right: string): string | undefined {
  const leftFlavor = inferPathFlavor(left);
  if (leftFlavor !== inferPathFlavor(right)) return undefined;
  const leftIdentity = projectRootIdentity(left, leftFlavor);
  const rightIdentity = projectRootIdentity(right, leftFlavor);
  return leftIdentity && leftIdentity === rightIdentity ? leftIdentity : undefined;
}

function taskContext(snapshot: ControlRoomSnapshot): Pick<
  MentorConsoleContext,
  "projectState" | "milestone" | "task" | "taskStatus"
> {
  const state = snapshot.state;
  if (!state || state.status === "missing") {
    return {
      projectState: "Not initialized",
      milestone: "Not available yet",
      task: "None",
      taskStatus: "Waiting for Core",
    };
  }
  if (state.status !== "valid") {
    return {
      projectState: "Not available yet",
      milestone: "Not available yet",
      task: "Not available yet",
      taskStatus: "Waiting for Core",
    };
  }

  const task = sanitizeTerminalLine(state.task, "None", 200);
  const hasCurrentTask = !/^(?:no current task\b|none$)/i.test(task);
  return {
    projectState: "Available — read only",
    milestone: sanitizeTerminalLine(state.milestone, "Not available yet", 200),
    task: hasCurrentTask ? task : "None",
    taskStatus: hasCurrentTask
      ? sanitizeTerminalLine(state.taskStatus, "Waiting for Core", 120)
      : "Waiting for Core",
  };
}

function masterPlanStatus(snapshot: ControlRoomSnapshot): MentorPlanStatus {
  if (snapshot.currentProjectInspection?.status === "ready") return "READY";
  if (snapshot.currentProjectInspection?.status === "missing-master-plan") return "MISSING";
  return "NOT AVAILABLE YET";
}

export function mentorContextFromSnapshot(snapshot: ControlRoomSnapshot): MentorConsoleContext | undefined {
  const project = snapshot.currentRegisteredProject;
  const projectRoot = snapshot.projectRoot;
  if (!project || !projectRoot) return undefined;

  const rootIdentity = matchingRootIdentity(project.projectRoot, projectRoot);
  if (!rootIdentity) return undefined;

  const mappedAccount = gptAccountById(snapshot.localWorkspace, project.gptAccountId);
  const chatGptProject = currentChatGptProject(snapshot);
  const task = taskContext(snapshot);
  const planStatus = masterPlanStatus(snapshot);
  const projectName = sanitizeTerminalLine(project.projectName, "ANN Project", 120);
  const gptAccountLabel = sanitizeTerminalLine(mappedAccount?.label, "Not configured", 120);
  const gptAccountState = mappedAccount?.browserLoginConfirmedAt
    ? "User confirmed browser login — not verified by ANN"
    : "Not verified by ANN";
  const chatGptProjectLabel = sanitizeTerminalLine(chatGptProject?.label, "Not configured", 120);
  const chatGptProjectState = chatGptProject ? "CONFIGURED — NOT VERIFIED" : "Not configured";
  const chatGptProjectUrl = sanitizeTerminalLine(chatGptProject?.url, "", 600);

  return {
    projectKey: JSON.stringify([
      project.projectId,
      rootIdentity,
      projectName,
      mappedAccount?.id ?? "",
      gptAccountLabel,
      gptAccountState,
      chatGptProjectLabel,
      chatGptProjectUrl,
    ]),
    projectId: sanitizeTerminalLine(project.projectId, "Not available yet", 120),
    projectName,
    projectRoot: sanitizeTerminalLine(projectRoot, "Not available yet", 500),
    localUser: sanitizeTerminalLine(snapshot.profile.displayName, "Not configured", 120),
    gptAccountLabel,
    gptAccountState,
    chatGptProjectLabel,
    chatGptProjectState,
    masterPlanStatus: planStatus,
    masterPlanPath: sanitizeTerminalLine(
      path.join(projectRoot, ".ann", "MASTER_PLAN.md"),
      "Not available yet",
      600,
    ),
    ...task,
    repository: sanitizeTerminalLine(snapshot.git?.repository.name, "Not available yet", 200),
    branch: sanitizeTerminalLine(snapshot.git?.branch.name, "Not available yet", 200),
    terminalReadiness: snapshot.terminal.status === "ready" ? "READY" : "NOT AVAILABLE YET",
  };
}

export function mentorTerminalTitle(context: MentorConsoleContext): string {
  return `ANN — ${sanitizeTerminalLine(context.projectName, "Project", 80)}`;
}

export function renderMentorBanner(context: MentorConsoleContext): readonly string[] {
  return [
    "────────────────────────────────────────",
    "ANN Mentor",
    `Project: ${context.projectName}`,
    `Root: ${context.projectRoot}`,
    `GPT context: ${context.gptAccountLabel}`,
    `ChatGPT Project: ${context.chatGptProjectLabel} — ${context.chatGptProjectState}`,
    `Master Plan: ${context.masterPlanStatus}`,
    `Task: ${context.task} — ${context.taskStatus}`,
    "────────────────────────────────────────",
  ];
}

export function renderMentorStatus(context: MentorConsoleContext): readonly string[] {
  return [
    `Local user: ${context.localUser}`,
    `Project: ${context.projectName}`,
    `Root: ${context.projectRoot}`,
    `GPT context: ${context.gptAccountLabel}`,
    `GPT state: ${context.gptAccountState}`,
    `ChatGPT Project: ${context.chatGptProjectLabel} — ${context.chatGptProjectState}`,
    `Master Plan: ${context.masterPlanStatus}`,
    `Task: ${context.task} — ${context.taskStatus}`,
    `Repository: ${context.repository}`,
    `Branch: ${context.branch}`,
    `Terminal readiness: ${context.terminalReadiness}`,
  ];
}

export function renderMentorProject(context: MentorConsoleContext): readonly string[] {
  return [
    `Project: ${context.projectName}`,
    `Root: ${context.projectRoot}`,
    "Registration: REGISTERED IN MY PROJECTS",
    `GPT context: ${context.gptAccountLabel}`,
    `ChatGPT Project: ${context.chatGptProjectLabel} — ${context.chatGptProjectState}`,
  ];
}

export function renderMentorPlan(context: MentorConsoleContext): readonly string[] {
  if (context.masterPlanStatus === "MISSING") {
    return [
      "Master Plan: MISSING",
      `Path: ${context.masterPlanPath}`,
      "Next capability: Master Plan Intake",
      "No authority files were changed.",
    ];
  }
  if (context.masterPlanStatus === "READY") {
    return [
      "Master Plan: READY",
      `Path: ${context.masterPlanPath}`,
      "Mode: Read-only",
    ];
  }
  return [
    "Master Plan: Not available yet",
    `Path: ${context.masterPlanPath}`,
    "Waiting for Core",
  ];
}

export function renderMentorTask(context: MentorConsoleContext): readonly string[] {
  return [
    `PROJECT_STATE: ${context.projectState}`,
    `Milestone: ${context.milestone}`,
    `Task: ${context.task}`,
    `Task status: ${context.taskStatus}`,
    "Mode: Read-only — no task transition was performed.",
  ];
}

export function renderMentorHelp(): readonly string[] {
  return [
    "Supported commands:",
    "  /status   Show a fresh read-only context snapshot",
    "  /project  Show the current registered ANN project",
    "  /plan     Show Master Plan presence and path",
    "  /task     Show existing Core project/task state",
    "  /help     Show this command list",
    "  /clear    Clear and redraw this ANN console only",
    "  /exit     Close this ANN console session only",
    "Natural-language requests are accepted, but Mentor reasoning/execution is not connected in UX1 yet.",
  ];
}

export const NATURAL_REQUEST_RESPONSE = [
  "Request received.",
  "Mentor reasoning/execution is not connected in UX1 yet.",
  "No project files or tasks were changed.",
] as const;

export const MASTER_PLAN_IMPORT_RESPONSE = [
  "Master Plan import is not enabled in this unit.",
  "No authority files were changed.",
] as const;
