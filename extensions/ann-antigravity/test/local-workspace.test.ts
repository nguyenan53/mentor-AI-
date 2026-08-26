import assert from "node:assert/strict";
import test from "node:test";

import {
  addOrUpdateProject,
  emptyLocalWorkspace,
  mapProjectToGptAccount,
  markProjectOpened,
  normalizeProjectRoot,
  projectByRoot,
  removeProject,
  sanitizeLocalWorkspace,
  setProjectChatGptLink,
  stableProjectId,
  upsertGptAccount,
  workspaceForStorage,
} from "../src/local-workspace";

const createdAt = "2026-08-26T01:00:00.000Z";

test("persists an explicit login-confirmed local account label", () => {
  const result = upsertGptAccount(
    emptyLocalWorkspace(),
    {
      label: "  Bao - ChatGPT Business  ",
      browserLoginConfirmedAt: createdAt,
    },
    () => "account-a",
  );

  assert.equal(result.account.label, "Bao - ChatGPT Business");
  assert.equal(result.account.browserLoginConfirmedAt, createdAt);
  assert.equal(result.state.currentGptAccountId, result.account.id);
  assert.deepEqual(workspaceForStorage(result.state), result.state);
});

test("whitelists the persisted model and drops sensitive fields", () => {
  const sanitized = sanitizeLocalWorkspace({
    version: 1,
    currentGptAccountId: "gpt-a",
    password: "must-not-persist",
    cookie: "session-cookie",
    apiKey: "sk-must-not-persist-1234567890",
    gptAccounts: [{
      id: "gpt-a",
      label: "Business account",
      browserLoginConfirmedAt: createdAt,
      sessionToken: "browser-token",
      email: "private@example.com",
    }],
    projects: [],
  });
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.gptAccounts.length, 1);
  assert.doesNotMatch(serialized, /must-not-persist|session-cookie|browser-token|private@example\.com/);
  assert.doesNotMatch(serialized, /password|cookie|apiKey|sessionToken|email/);
});

test("adds, reopens, and removes a registry entry without duplicating its root", () => {
  const first = addOrUpdateProject(
    emptyLocalWorkspace(),
    { projectName: "Project A", projectRoot: "C:\\ANN\\Project-A" },
    createdAt,
    "win32",
  );
  const duplicate = addOrUpdateProject(
    first.state,
    { projectName: "Project A renamed", projectRoot: "c:/ann/project-a/." },
    "2026-08-26T02:00:00.000Z",
    "win32",
  );

  assert.equal(first.added, true);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.state.projects.length, 1);
  assert.equal(duplicate.project.projectId, first.project.projectId);
  assert.equal(duplicate.project.lastOpenedAt, createdAt);

  const reopened = markProjectOpened(duplicate.state, first.project.projectId, "2026-08-26T03:00:00.000Z");
  assert.equal(reopened.projects[0]?.lastOpenedAt, "2026-08-26T03:00:00.000Z");
  assert.equal(removeProject(reopened, first.project.projectId).projects.length, 0);
});

test("uses stable case-insensitive Windows path identity and rejects invalid roots", () => {
  assert.equal(
    stableProjectId("C:\\Users\\Bao\\ANN", "win32"),
    stableProjectId("c:/users/bao/ann/.", "win32"),
  );
  assert.equal(normalizeProjectRoot("relative/project", "win32"), undefined);
  assert.equal(normalizeProjectRoot("relative/project", "posix"), undefined);
  assert.throws(() => addOrUpdateProject(
    emptyLocalWorkspace(),
    { projectName: "Invalid", projectRoot: "relative/project" },
    createdAt,
    "win32",
  ));
});

test("maps one local GPT account and one optional ChatGPT Project per ANN project", () => {
  const accountResult = upsertGptAccount(
    emptyLocalWorkspace(),
    { label: "Bao Business" },
    () => "account-a",
  );
  const projectResult = addOrUpdateProject(
    accountResult.state,
    { projectName: "Project A", projectRoot: "/ann/project-a" },
    createdAt,
    "posix",
  );
  const mapped = mapProjectToGptAccount(
    projectResult.state,
    projectResult.project.projectId,
    accountResult.account.id,
  );
  const linked = setProjectChatGptLink(
    mapped,
    projectResult.project.projectId,
    "ANN Mentor",
    "https://chatgpt.com/c/example",
  );
  const project = projectByRoot(linked, "/ann/project-a", "posix");

  assert.equal(project?.gptAccountId, accountResult.account.id);
  assert.equal(project?.chatGptProjectLabel, "ANN Mentor");
  assert.equal(project?.chatGptProjectUrl, "https://chatgpt.com/c/example");
});
