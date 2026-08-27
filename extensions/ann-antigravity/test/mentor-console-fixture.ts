import path from "node:path";

import type { LocalAnnProject, LocalWorkspaceState } from "../src/local-workspace";
import { mentorContextFromSnapshot, type MentorConsoleContext } from "../src/mentor-console-model";
import type { ControlRoomSnapshot } from "../src/view-model";

export const PROJECT_ROOT = process.platform === "win32" ? "C:\\ANN\\Project-A" : "/ann/Project-A";

export const registeredProject: LocalAnnProject = {
  projectId: "local-project-a",
  projectName: "Project A",
  projectRoot: PROJECT_ROOT,
  lastOpenedAt: "2026-08-26T00:00:00.000Z",
  gptAccountId: "gpt-account-a",
  chatGptProjectLabel: "ANN Mentor",
  chatGptProjectUrl: "https://chatgpt.com/c/example",
};

export const localWorkspace: LocalWorkspaceState = {
  version: 1,
  currentGptAccountId: "gpt-account-a",
  gptAccounts: [{
    id: "gpt-account-a",
    label: "Bao - ChatGPT Business",
    browserLoginConfirmedAt: "2026-08-26T00:00:00.000Z",
  }],
  projects: [registeredProject],
};

export function readySnapshot(overrides: Partial<ControlRoomSnapshot> = {}): ControlRoomSnapshot {
  return {
    projectRoot: PROJECT_ROOT,
    profile: { displayName: "Bao" },
    terminal: {
      shellLabel: "PowerShell",
      status: "ready",
      description: "Ready. No command has been executed.",
    },
    localWorkspace,
    currentRegisteredProject: registeredProject,
    currentProjectInspection: { status: "ready", masterPlanLabel: "Ready" },
    registeredProjects: [{
      project: registeredProject,
      inspection: { status: "ready", masterPlanLabel: "Ready" },
    }],
    state: {
      status: "valid",
      statePath: path.join(PROJECT_ROOT, ".ann", "PROJECT_STATE.json"),
      projectName: "core-project-id",
      milestone: "M1",
      task: "M1.3",
      taskStatus: "COMPLETE",
      verification: "PASSED",
    },
    git: {
      repository: { providerLabel: "GitHub", name: "nguyenan53/mentor-AI-", source: "git" },
      branch: { name: "feat/ann-ux1-start-mentor-console", source: "git" },
    },
    ...overrides,
  };
}

export function readyContext(overrides: Partial<ControlRoomSnapshot> = {}): MentorConsoleContext {
  const context = mentorContextFromSnapshot(readySnapshot(overrides));
  if (!context) throw new Error("Expected the fixture to produce a Mentor Console context.");
  return context;
}
