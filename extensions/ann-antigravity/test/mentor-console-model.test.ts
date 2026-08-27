import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  mentorContextFromSnapshot,
  mentorTerminalTitle,
  renderMentorBanner,
  renderMentorPlan,
  renderMentorTask,
  sanitizeTerminalLine,
} from "../src/mentor-console-model";
import { localWorkspace, PROJECT_ROOT, readySnapshot, registeredProject } from "./mentor-console-fixture";

test("START context is unavailable without one matching current registered project", () => {
  assert.equal(mentorContextFromSnapshot(readySnapshot({ currentRegisteredProject: undefined })), undefined);
  assert.equal(mentorContextFromSnapshot(readySnapshot({ projectRoot: undefined })), undefined);
  assert.equal(mentorContextFromSnapshot(readySnapshot({ projectRoot: path.join(PROJECT_ROOT, "other") })), undefined);
});

test("console context and banner use the registered project identity and real mapped metadata", () => {
  const context = mentorContextFromSnapshot(readySnapshot());

  assert.ok(context);
  assert.equal(context.projectName, "Project A");
  assert.equal(context.projectRoot, PROJECT_ROOT);
  assert.equal(context.gptAccountLabel, "Bao - ChatGPT Business");
  assert.equal(context.chatGptProjectLabel, "ANN Mentor");
  assert.equal(context.masterPlanStatus, "READY");
  assert.equal(context.task, "M1.3");
  assert.equal(mentorTerminalTitle(context), "ANN — Project A");
  assert.match(renderMentorBanner(context).join("\n"), /Project: Project A/);
  assert.doesNotMatch(renderMentorBanner(context).join("\n"), /Guardian PASS|Worker running|Antigravity connected/);
});

test("mapped GPT context is not guessed from the globally selected account", () => {
  const unmappedProject = { ...registeredProject, gptAccountId: undefined };
  const context = mentorContextFromSnapshot(readySnapshot({
    currentRegisteredProject: unmappedProject,
    localWorkspace: { ...localWorkspace, projects: [unmappedProject] },
  }));

  assert.ok(context);
  assert.equal(context.gptAccountLabel, "Not configured");
  assert.equal(context.gptAccountState, "Not verified by ANN");
});

test("session identity changes when its mapped account or ChatGPT Project context changes", () => {
  const original = mentorContextFromSnapshot(readySnapshot());
  const renamedAccountWorkspace = {
    ...localWorkspace,
    gptAccounts: [{ ...localWorkspace.gptAccounts[0]!, label: "Bao - Personal" }],
  };
  const changedAccount = mentorContextFromSnapshot(readySnapshot({
    localWorkspace: renamedAccountWorkspace,
  }));
  const changedChatGptProjectRecord = {
    ...registeredProject,
    chatGptProjectLabel: "Different ChatGPT Project",
  };
  const changedChatGptProject = mentorContextFromSnapshot(readySnapshot({
    currentRegisteredProject: changedChatGptProjectRecord,
    localWorkspace: { ...localWorkspace, projects: [changedChatGptProjectRecord] },
  }));

  assert.ok(original);
  assert.ok(changedAccount);
  assert.ok(changedChatGptProject);
  assert.notEqual(changedAccount.projectKey, original.projectKey);
  assert.notEqual(changedChatGptProject.projectKey, original.projectKey);
});

test("plan and task renderers remain read-only and truthful for missing Core state", () => {
  const context = mentorContextFromSnapshot(readySnapshot({
    currentProjectInspection: { status: "missing-master-plan", masterPlanLabel: "Missing" },
    state: {
      status: "missing",
      statePath: path.join(PROJECT_ROOT, ".ann", "PROJECT_STATE.json"),
      projectName: "Project A",
      milestone: "Not set",
      task: "No current task",
      verification: "UNAVAILABLE",
    },
  }));

  assert.ok(context);
  assert.deepEqual(renderMentorPlan(context), [
    "Master Plan: MISSING",
    `Path: ${path.join(PROJECT_ROOT, ".ann", "MASTER_PLAN.md")}`,
    "Next capability: Master Plan Intake",
    "No authority files were changed.",
  ]);
  assert.match(renderMentorTask(context).join("\n"), /PROJECT_STATE: Not initialized/);
  assert.match(renderMentorTask(context).join("\n"), /Task: None/);
  assert.match(renderMentorTask(context).join("\n"), /no task transition was performed/i);
});

test("an existing Core task ID remains visible when taskStates has no status entry", () => {
  const context = mentorContextFromSnapshot(readySnapshot({
    state: {
      status: "valid",
      statePath: path.join(PROJECT_ROOT, ".ann", "PROJECT_STATE.json"),
      projectName: "Project A",
      milestone: "M1",
      task: "M1.2",
      verification: "UNAVAILABLE",
    },
  }));

  assert.ok(context);
  assert.equal(context.task, "M1.2");
  assert.equal(context.taskStatus, "Waiting for Core");
});

test("terminal-bound labels strip all control and Unicode format injection", () => {
  const maliciousProject = { ...registeredProject, projectName: "Project\u001b[31m\u202e\u061cevil" };
  const context = mentorContextFromSnapshot(readySnapshot({
    currentRegisteredProject: maliciousProject,
    localWorkspace: { ...localWorkspace, projects: [maliciousProject] },
  }));

  assert.ok(context);
  assert.doesNotMatch(context.projectName, /[\u001b\u202e\u061c]/u);
  assert.doesNotMatch(mentorTerminalTitle(context), /[\u001b\u202e\u061c]/u);
  assert.equal(sanitizeTerminalLine("A\nB\tC"), "A B C");
  const openAiTokenFixture = ["sk", "proj", "0123456789abcdef0123456789"].join("-");
  assert.equal(
    sanitizeTerminalLine(`token ${openAiTokenFixture}`),
    "[redacted]",
  );
  assert.equal(
    sanitizeTerminalLine("-----BEGIN PRIVATE KEY-----\nMIIBverysecretbody\n-----END PRIVATE KEY-----"),
    "[redacted]",
  );
  assert.equal(sanitizeTerminalLine("client_secret = highly-sensitive"), "[redacted]");
  assert.equal(sanitizeTerminalLine("token\u200d=qwerty12345"), "[redacted]");
});

test("credential-shaped persisted metadata is redacted before banner rendering", () => {
  for (const projectName of [
    ["AIza", "SyDUMMYSECRET1234567890"].join(""),
    ["xoxb", "123456789012", "abcdefghijklmnop"].join("-"),
    ["glpat", "abcdefghijklmnopqrst"].join("-"),
    ["npm", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_"),
    "token=qwerty12345",
  ]) {
    const maliciousProject = { ...registeredProject, projectName };
    const context = mentorContextFromSnapshot(readySnapshot({
      currentRegisteredProject: maliciousProject,
      localWorkspace: { ...localWorkspace, projects: [maliciousProject] },
    }));

    assert.ok(context);
    assert.equal(context.projectName, "[redacted]");
    assert.doesNotMatch(renderMentorBanner(context).join("\n"), new RegExp(projectName));
  }
});
