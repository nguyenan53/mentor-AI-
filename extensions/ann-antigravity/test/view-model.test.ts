import assert from "node:assert/strict";
import test from "node:test";

import { type LocalAnnProject, type LocalWorkspaceState } from "../src/local-workspace";
import { type ControlRoomSnapshot, formatTaskStatus, nextActionFor } from "../src/view-model";

const readyTerminal = {
  shellLabel: "PowerShell",
  status: "ready" as const,
  description: "Ready. No command has been executed.",
};

const registeredProject: LocalAnnProject = {
  projectId: "local-project-a",
  projectName: "mentor-ai-ann",
  projectRoot: "C:/Projects/mentor-AI-",
  lastOpenedAt: "2026-08-26T00:00:00.000Z",
  gptAccountId: "gpt-account-a",
  chatGptProjectLabel: "ANN Mentor",
  chatGptProjectUrl: "https://chatgpt.com/c/example",
};

const localWorkspace: LocalWorkspaceState = {
  version: 1,
  currentGptAccountId: "gpt-account-a",
  gptAccounts: [{
    id: "gpt-account-a",
    label: "Bao - ChatGPT Business",
    browserLoginConfirmedAt: "2026-08-26T00:00:00.000Z",
  }],
  projects: [registeredProject],
};

function completeSnapshot(overrides: Partial<ControlRoomSnapshot> = {}): ControlRoomSnapshot {
  return {
    projectRoot: registeredProject.projectRoot,
    profile: { displayName: "Bao" },
    terminal: readyTerminal,
    localWorkspace,
    currentRegisteredProject: registeredProject,
    currentProjectInspection: { status: "ready", masterPlanLabel: "Ready" },
    registeredProjects: [{
      project: registeredProject,
      inspection: { status: "ready", masterPlanLabel: "Ready" },
    }],
    state: {
      status: "valid",
      statePath: "C:/Projects/mentor-AI-/.ann/PROJECT_STATE.json",
      projectName: "mentor-ai-ann",
      milestone: "M1",
      task: "M1.3",
      taskStatus: "COMPLETE",
      verification: "PASSED",
    },
    ...overrides,
  };
}

test("turns a completed current task into a Core-owned next action", () => {
  assert.deepEqual(nextActionFor(completeSnapshot()), {
    label: "Select the next Core unit from the Master Plan.",
  });
  assert.equal(formatTaskStatus("READY_TO_IMPLEMENT"), "Ready To Implement");
});

test("prioritizes safe identity and project empty states", () => {
  const noWorkspace: LocalWorkspaceState = { version: 1, gptAccounts: [], projects: [] };
  assert.equal(nextActionFor({
    profile: {},
    terminal: readyTerminal,
    localWorkspace: noWorkspace,
    registeredProjects: [],
  }).command, "annGuardian.openExistingProject");
  assert.equal(nextActionFor(completeSnapshot({ profile: {} })).command, "annGuardian.configureUserProfile");
  assert.equal(nextActionFor(completeSnapshot({
    localWorkspace: { version: 1, gptAccounts: [], projects: [] },
    currentRegisteredProject: undefined,
  })).command, "annGuardian.loginGpt");
});

test("makes registration and ChatGPT Project linking explicit", () => {
  assert.equal(nextActionFor(completeSnapshot({ currentRegisteredProject: undefined })).command,
    "annGuardian.registerCurrentProject");
  const withoutLink: LocalAnnProject = {
    ...registeredProject,
    chatGptProjectLabel: undefined,
    chatGptProjectUrl: undefined,
  };
  const noLinkWorkspace: LocalWorkspaceState = {
    ...localWorkspace,
    projects: [withoutLink],
  };
  assert.equal(nextActionFor(completeSnapshot({
    localWorkspace: noLinkWorkspace,
    currentRegisteredProject: withoutLink,
  })).command, "annGuardian.configureProjectChatGptLink");
});

test("never advances blocked state and never invents the next Core unit", () => {
  const blocked = completeSnapshot({
    state: { ...completeSnapshot().state!, taskStatus: "BLOCKED" },
  });
  const action = nextActionFor(blocked);

  assert.match(action.label, /Resolve the recorded ANN Core blocker/);
  assert.doesNotMatch(action.label, /M1\.4/);
  assert.equal(action.command, undefined);
});
