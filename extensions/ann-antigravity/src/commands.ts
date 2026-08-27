import { randomUUID } from "node:crypto";
import path from "node:path";

import * as vscode from "vscode";

import { ANN_FILES, type AnnFileId, getAnnFile } from "./ann-files";
import {
  LOCAL_WORKSPACE_STORAGE_KEY,
  addOrUpdateProject,
  currentGptAccount,
  gptAccountById,
  mapProjectToGptAccount,
  markProjectOpened,
  projectById,
  readLocalWorkspace,
  removeProject,
  selectCurrentGptAccount,
  setProjectChatGptLink,
  upsertGptAccount,
  workspaceForStorage,
  type LocalAnnProject,
  type LocalWorkspaceState,
} from "./local-workspace";
import { inspectProjectRoot } from "./project-root-status";
import { readProjectState } from "./state-reader";
import type { MentorSessionStartResult } from "./mentor-session-manager";
import {
  USER_PROFILE_STORAGE_KEY,
  normalizeChatGptUrl,
  normalizeLocalLabel,
  readChatGptMentorLink,
  readLocalUserProfile,
  type LocalUserProfile,
} from "./user-settings";
import { currentChatGptProject, type ControlRoomSnapshot } from "./view-model";

export const CHATGPT_LOGIN_URL = "https://chatgpt.com/auth/login";
export const CHATGPT_HOME_URL = "https://chatgpt.com/";

export interface CommandContext {
  getSnapshot(): ControlRoomSnapshot;
  refresh(): Promise<void>;
  startAnn(): MentorSessionStartResult;
}

interface AccountPick extends vscode.QuickPickItem {
  readonly selectionKind: "account" | "another" | "later";
  readonly accountId?: string;
}

interface LinkPick extends vscode.QuickPickItem {
  readonly selectionKind: "link" | "open" | "later";
}

function projectRoot(context: CommandContext): string | undefined {
  return context.getSnapshot().projectRoot;
}

function now(): string {
  return new Date().toISOString();
}

function requiredLabelMessage(value: string): string | undefined {
  return normalizeLocalLabel(value) ? undefined : "Enter a non-empty, non-secret display label.";
}

function chatGptUrlMessage(value: string): string | undefined {
  return normalizeChatGptUrl(value)
    ? undefined
    : "Enter a credential-free HTTPS chatgpt.com project or chat URL.";
}

async function saveLocalWorkspace(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  state: LocalWorkspaceState,
): Promise<boolean> {
  try {
    await extensionContext.globalState.update(
      LOCAL_WORKSPACE_STORAGE_KEY,
      workspaceForStorage(state),
    );
  } catch {
    void vscode.window.showErrorMessage("ANN could not save local identity/project metadata.");
    return false;
  }
  await context.refresh();
  return true;
}

async function openExternal(url: string, failureMessage: string): Promise<boolean> {
  try {
    if (await vscode.env.openExternal(vscode.Uri.parse(url))) return true;
  } catch {
    // Report one value-free error below. URLs and local labels are never logged.
  }
  void vscode.window.showErrorMessage(failureMessage);
  return false;
}

async function openAnnFile(context: CommandContext, fileId: AnnFileId): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    void vscode.window.showInformationMessage("Open an ANN project first.");
    return;
  }

  const descriptor = getAnnFile(fileId);
  const fileUri = vscode.Uri.file(path.join(root, ...descriptor.relativePath.split("/")));
  try {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document, { preview: false });
  } catch {
    void vscode.window.showWarningMessage(`${descriptor.label} is not available at ${descriptor.relativePath}.`);
  }
}

async function runVerification(context: CommandContext): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    void vscode.window.showInformationMessage("Open an ANN project before running verification.");
    return;
  }
  if (context.getSnapshot().currentProjectInspection?.status !== "ready") {
    void vscode.window.showWarningMessage("Verification requires an existing .ann/MASTER_PLAN.md.");
    return;
  }
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage("Trust this workspace before running ANN verification.");
    return;
  }

  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const execution = new vscode.ProcessExecution(npmExecutable, ["run", "check"], { cwd: root });
  const task = new vscode.Task(
    { type: "ann-verification" },
    vscode.TaskScope.Workspace,
    "ANN: Run Verification",
    "ANN Home",
    execution,
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
    focus: false,
  };

  try {
    const runningTask = await vscode.tasks.executeTask(task);
    const completion = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution === runningTask) {
        completion.dispose();
        void context.refresh();
      }
    });
  } catch {
    void vscode.window.showErrorMessage("ANN verification could not be started.");
  }
}

async function configureUserProfile(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const current = readLocalUserProfile(extensionContext.globalState);
  const displayName = await vscode.window.showInputBox({
    title: "ANN Local User Profile",
    prompt: "Enter the local label ANN should show for you on this machine.",
    placeHolder: "Bao",
    value: current.displayName,
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  if (displayName === undefined) return;

  const normalized = normalizeLocalLabel(displayName);
  if (!normalized) return;
  const profile: LocalUserProfile = { displayName: normalized };
  try {
    await extensionContext.globalState.update(USER_PROFILE_STORAGE_KEY, profile);
  } catch {
    void vscode.window.showErrorMessage("ANN could not save the local user label.");
    return;
  }
  await context.refresh();
}

async function askForAccountLabel(value?: string): Promise<string | undefined> {
  const label = await vscode.window.showInputBox({
    title: "GPT Web Account — Local Label",
    prompt: "Use a local label that helps you remember the intended ChatGPT account/workspace.",
    placeHolder: "Bao - ChatGPT Business",
    value,
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  return label === undefined ? undefined : normalizeLocalLabel(label);
}

async function loginGpt(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  if (!await openExternal(CHATGPT_LOGIN_URL, "The official ChatGPT login page could not be opened.")) return;

  const confirmation = await vscode.window.showInformationMessage(
    "ChatGPT and your browser control the login session. ANN cannot read the signed-in email, cookies, or session.",
    { modal: true, detail: "Choose ‘I am logged in’ only after you have completed browser login." },
    "I am logged in",
  );
  if (confirmation !== "I am logged in") return;

  const state = readLocalWorkspace(extensionContext.globalState);
  const existing = currentGptAccount(state);
  const label = await askForAccountLabel(existing?.label);
  if (!label) return;

  const result = upsertGptAccount(
    state,
    { id: existing?.id, label, browserLoginConfirmedAt: now() },
    randomUUID,
  );
  await saveLocalWorkspace(extensionContext, context, result.state);
}

async function setGptAccountLabel(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const state = readLocalWorkspace(extensionContext.globalState);
  const existing = currentGptAccount(state);
  const label = await askForAccountLabel(existing?.label);
  if (!label) return;
  const result = upsertGptAccount(state, { id: existing?.id, label }, randomUUID);
  await saveLocalWorkspace(extensionContext, context, result.state);
}

async function changeGptAccount(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  if (!await openExternal(CHATGPT_HOME_URL, "ChatGPT could not be opened for account switching.")) return;
  const confirmation = await vscode.window.showInformationMessage(
    "Logout and account switching happen on the ChatGPT website. ANN will only save a new local label.",
    { modal: true, detail: "Existing project mappings keep their previous local account label." },
    "I switched accounts",
  );
  if (confirmation !== "I switched accounts") return;
  const label = await askForAccountLabel();
  if (!label) return;

  const state = readLocalWorkspace(extensionContext.globalState);
  const result = upsertGptAccount(
    state,
    { label, browserLoginConfirmedAt: now() },
    randomUUID,
  );
  await saveLocalWorkspace(extensionContext, context, result.state);
}

async function clearGptAccountContext(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    "Clear the current local GPT account context? Existing project mappings remain unchanged.",
    { modal: true },
    "Clear Context",
  );
  if (confirmation !== "Clear Context") return;
  const state = selectCurrentGptAccount(readLocalWorkspace(extensionContext.globalState), undefined);
  await saveLocalWorkspace(extensionContext, context, state);
}

async function selectGptAccountContext(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  accountId: unknown,
): Promise<void> {
  if (typeof accountId !== "string") return;
  try {
    const state = selectCurrentGptAccount(readLocalWorkspace(extensionContext.globalState), accountId);
    await saveLocalWorkspace(extensionContext, context, state);
  } catch {
    void vscode.window.showWarningMessage("The selected local GPT account label is no longer available.");
  }
}

async function registerCurrentProject(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const snapshot = context.getSnapshot();
  const root = snapshot.projectRoot;
  if (!root || !snapshot.state) {
    void vscode.window.showInformationMessage("Open an ANN project before adding it to My Projects.");
    return;
  }
  if (snapshot.currentRegisteredProject) {
    void vscode.window.showInformationMessage("This ANN project is already registered in My Projects.");
    return;
  }

  const confirmation = await vscode.window.showInformationMessage(
    `Add ${snapshot.state.projectName} to My Projects?`,
    {
      modal: true,
      detail: `Root: ${root}\nOnly local registry metadata will be saved. Project files are not modified.`,
    },
    "Add to My Projects",
  );
  if (confirmation !== "Add to My Projects") return;

  let state = readLocalWorkspace(extensionContext.globalState);
  let account = currentGptAccount(state);
  const legacyLink = readChatGptMentorLink(extensionContext.globalState, root);
  if (legacyLink) {
    account = state.gptAccounts.find((candidate) => candidate.label === legacyLink.accountLabel);
    if (!account) {
      const accountResult = upsertGptAccount(state, { label: legacyLink.accountLabel }, randomUUID);
      state = accountResult.state;
      account = accountResult.account;
    }
  }
  const result = addOrUpdateProject(
    state,
    {
      projectName: snapshot.state.projectName,
      projectRoot: root,
      gptAccountId: account?.id,
      chatGptProjectLabel: legacyLink?.projectLabel,
      chatGptProjectUrl: legacyLink?.url,
    },
    now(),
  );
  await saveLocalWorkspace(extensionContext, context, result.state);
}

async function openRegisteredProject(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  if (typeof projectId !== "string") return;
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = projectById(state, projectId);
  if (!project) {
    void vscode.window.showWarningMessage("That project is no longer in the local registry.");
    return;
  }
  const inspection = await inspectProjectRoot(project.projectRoot);
  if (inspection.status === "missing-root" || inspection.status === "unavailable") {
    void vscode.window.showWarningMessage(inspection.masterPlanLabel);
    return;
  }

  try {
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(project.projectRoot), true);
  } catch {
    void vscode.window.showErrorMessage("The registered project folder could not be opened.");
    return;
  }
  await saveLocalWorkspace(extensionContext, context, markProjectOpened(state, projectId, now()));
}

async function removeRegisteredProject(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  if (typeof projectId !== "string") return;
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = projectById(state, projectId);
  if (!project) return;
  const confirmation = await vscode.window.showWarningMessage(
    `Remove ${project.projectName} from My Projects?`,
    { modal: true, detail: "Only the local registry entry is removed. The folder and all project files stay untouched." },
    "Remove Local Entry",
  );
  if (confirmation !== "Remove Local Entry") return;
  await saveLocalWorkspace(extensionContext, context, removeProject(state, projectId));
}

async function accountPickForWizard(
  state: LocalWorkspaceState,
): Promise<{ state: LocalWorkspaceState; accountId?: string } | undefined> {
  const picks: AccountPick[] = [
    ...state.gptAccounts.map((account) => ({
      label: account.label,
      description: account.browserLoginConfirmedAt ? "Browser login user-confirmed" : "Local label only",
      selectionKind: "account" as const,
      accountId: account.id,
    })),
    { label: "Another account", description: "Create a new local label", selectionKind: "another" },
    { label: "Configure later", description: "No GPT account mapping", selectionKind: "later" },
  ];
  const selection = await vscode.window.showQuickPick(picks, {
    title: "New Personal Project — Step 2 of 5: GPT account context",
    placeHolder: "This is a local context, not ChatGPT authentication.",
    ignoreFocusOut: true,
  });
  if (!selection) return undefined;
  if (selection.selectionKind === "later") return { state };
  if (selection.selectionKind === "account") return { state, accountId: selection.accountId };

  const label = await askForAccountLabel();
  if (!label) return undefined;
  const result = upsertGptAccount(state, { label }, randomUUID);
  return { state: result.state, accountId: result.account.id };
}

async function askForChatGptProjectLink(): Promise<{ label: string; url: string } | undefined> {
  const labelInput = await vscode.window.showInputBox({
    title: "ChatGPT Project — Local Label",
    prompt: "Enter the project/chat label shown in ANN.",
    placeHolder: "ANN Mentor",
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  if (labelInput === undefined) return undefined;
  const urlInput = await vscode.window.showInputBox({
    title: "ChatGPT Project — URL",
    prompt: "Paste a credential-free HTTPS chatgpt.com project or chat URL.",
    placeHolder: "https://chatgpt.com/g/g-p-.../project",
    ignoreFocusOut: true,
    validateInput: chatGptUrlMessage,
  });
  if (urlInput === undefined) return undefined;
  const label = normalizeLocalLabel(labelInput);
  const url = normalizeChatGptUrl(urlInput);
  return label && url ? { label, url } : undefined;
}

async function linkPickForWizard(): Promise<{ label?: string; url?: string } | undefined> {
  const picks: LinkPick[] = [
    { label: "Link existing ChatGPT Project URL", selectionKind: "link" },
    { label: "Open ChatGPT Projects in browser", description: "Return to paste a URL", selectionKind: "open" },
    { label: "Configure later", selectionKind: "later" },
  ];
  const selection = await vscode.window.showQuickPick(picks, {
    title: "New Personal Project — Step 3 of 5: ChatGPT Project association",
    placeHolder: "ANN cannot enumerate or create ChatGPT web Projects.",
    ignoreFocusOut: true,
  });
  if (!selection) return undefined;
  if (selection.selectionKind === "later") return {};
  if (selection.selectionKind === "open") {
    if (!await openExternal(CHATGPT_HOME_URL, "ChatGPT Projects could not be opened.")) return undefined;
    const next = await vscode.window.showInformationMessage(
      "Create or select the project in ChatGPT, then return to ANN.",
      { modal: true },
      "Link a Project Now",
      "Configure Later",
    );
    if (next === "Configure Later") return {};
    if (next !== "Link a Project Now") return undefined;
  }
  return await askForChatGptProjectLink();
}

async function newPersonalProject(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  preselectedRoot?: string,
): Promise<void> {
  const projectNameInput = await vscode.window.showInputBox({
    title: "New Personal Project — Step 1 of 5: Project",
    prompt: "Enter the personal project name. UX0.5 registers an existing folder only.",
    placeHolder: "Project A",
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  if (projectNameInput === undefined) return;
  const projectName = normalizeLocalLabel(projectNameInput);
  if (!projectName) return;

  let selectedRoot = preselectedRoot;
  if (!selectedRoot) {
    const selection = await vscode.window.showOpenDialog({
      title: "New Personal Project — Select Existing Folder",
      openLabel: "Use This Folder",
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    selectedRoot = selection?.[0]?.fsPath;
  }
  if (!selectedRoot) return;

  let draftState = readLocalWorkspace(extensionContext.globalState);
  const accountSelection = await accountPickForWizard(draftState);
  if (!accountSelection) return;
  draftState = accountSelection.state;

  const chatGptLink = await linkPickForWizard();
  if (chatGptLink === undefined) return;
  const inspection = await inspectProjectRoot(selectedRoot);
  if (inspection.status === "missing-root" || inspection.status === "unavailable") {
    void vscode.window.showWarningMessage(inspection.masterPlanLabel);
    return;
  }

  const masterPlanStep = await vscode.window.showInformationMessage(
    "New Personal Project — Step 4 of 5: Master Plan",
    {
      modal: true,
      detail: inspection.status === "ready"
        ? "Existing .ann/MASTER_PLAN.md detected. UX0.5 will not change it."
        : "Master Plan: Add later. Master Plan Inbox is coming in UX3; UX0.5 will not create .ann files.",
    },
    "Continue",
  );
  if (masterPlanStep !== "Continue") return;

  const account = gptAccountById(draftState, accountSelection.accountId);
  const review = await vscode.window.showInformationMessage(
    "New Personal Project — Step 5 of 5: Review",
    {
      modal: true,
      detail: [
        `Name: ${projectName}`,
        `Root: ${selectedRoot}`,
        `GPT account: ${account?.label ?? "Configure later"}${account ? " (local label)" : ""}`,
        `ChatGPT project: ${chatGptLink.label ?? "Configure later"}`,
        `Master Plan: ${inspection.status === "ready" ? "Existing" : "Not configured"}`,
        "",
        "Add Project saves local registry metadata only. It does not initialize Git, .ann, tasks, or execution.",
      ].join("\n"),
    },
    "Add Project",
  );
  if (review !== "Add Project") return;

  const result = addOrUpdateProject(
    draftState,
    {
      projectName,
      projectRoot: selectedRoot,
      gptAccountId: account?.id,
      chatGptProjectLabel: chatGptLink.label,
      chatGptProjectUrl: chatGptLink.url,
    },
    now(),
  );
  if (!await saveLocalWorkspace(extensionContext, context, result.state)) return;

  const next = await vscode.window.showInformationMessage(
    result.added ? "Project added to My Projects." : "Existing project registry entry updated.",
    "Open Project",
  );
  if (next === "Open Project") {
    await openRegisteredProject(extensionContext, context, result.project.projectId);
  }
}

async function openExistingProject(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const selection = await vscode.window.showOpenDialog({
    title: "Open Existing ANN Project",
    openLabel: "Inspect Folder",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });
  const root = selection?.[0]?.fsPath;
  if (!root) return;

  const inspection = await inspectProjectRoot(root);
  if (inspection.status === "missing-root" || inspection.status === "unavailable") {
    void vscode.window.showWarningMessage(inspection.masterPlanLabel);
    return;
  }
  if (inspection.status === "missing-master-plan") {
    const next = await vscode.window.showInformationMessage(
      "This folder is not initialized as an ANN project.",
      {
        modal: true,
        detail: "UX0.5 will not create .ann or governance files. You may continue to the local New Project wizard shell.",
      },
      "New Project",
    );
    if (next === "New Project") await newPersonalProject(extensionContext, context, root);
    return;
  }

  const projectState = await readProjectState(root);
  const confirmation = await vscode.window.showInformationMessage(
    "Existing ANN project detected.",
    { modal: true, detail: `${projectState.projectName}\n${root}\nProject files will remain unchanged.` },
    "Add to My Projects",
  );
  if (confirmation !== "Add to My Projects") return;

  let state = readLocalWorkspace(extensionContext.globalState);
  let account = currentGptAccount(state);
  const legacyLink = readChatGptMentorLink(extensionContext.globalState, root);
  if (legacyLink) {
    account = state.gptAccounts.find((candidate) => candidate.label === legacyLink.accountLabel);
    if (!account) {
      const accountResult = upsertGptAccount(state, { label: legacyLink.accountLabel }, randomUUID);
      state = accountResult.state;
      account = accountResult.account;
    }
  }
  const result = addOrUpdateProject(
    state,
    {
      projectName: projectState.projectName,
      projectRoot: root,
      gptAccountId: account?.id,
      chatGptProjectLabel: legacyLink?.projectLabel,
      chatGptProjectUrl: legacyLink?.url,
    },
    now(),
  );
  if (!await saveLocalWorkspace(extensionContext, context, result.state)) return;
  const next = await vscode.window.showInformationMessage("Project added to My Projects.", "Open Project");
  if (next === "Open Project") {
    await openRegisteredProject(extensionContext, context, result.project.projectId);
  }
}

function resolveProject(context: CommandContext, state: LocalWorkspaceState, projectId: unknown): LocalAnnProject | undefined {
  return typeof projectId === "string"
    ? projectById(state, projectId)
    : context.getSnapshot().currentRegisteredProject;
}

async function mapProjectGptAccount(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = resolveProject(context, state, projectId);
  if (!project) {
    void vscode.window.showInformationMessage("Register the ANN project before mapping a GPT account context.");
    return;
  }
  if (state.gptAccounts.length === 0) {
    const next = await vscode.window.showInformationMessage(
      "No local GPT account labels exist yet.",
      "Set Account Label",
    );
    if (next === "Set Account Label") await setGptAccountLabel(extensionContext, context);
    return;
  }

  const picks = [
    ...state.gptAccounts.map((account) => ({ label: account.label, accountId: account.id })),
    { label: "Remove account mapping", accountId: undefined },
  ];
  const selection = await vscode.window.showQuickPick(picks, {
    title: `Map GPT Account Context — ${project.projectName}`,
    placeHolder: "Local mapping only; ANN does not authenticate ChatGPT.",
  });
  if (!selection) return;
  const updated = mapProjectToGptAccount(state, project.projectId, selection.accountId);
  await saveLocalWorkspace(extensionContext, context, updated);
}

async function configureProjectChatGptLink(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = resolveProject(context, state, projectId);
  if (!project) {
    void vscode.window.showInformationMessage("Register the ANN project before linking a ChatGPT Project.");
    return;
  }
  const link = await askForChatGptProjectLink();
  if (!link) return;
  await saveLocalWorkspace(
    extensionContext,
    context,
    setProjectChatGptLink(state, project.projectId, link.label, link.url),
  );
}

async function clearProjectChatGptLink(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = resolveProject(context, state, projectId);
  if (!project) return;
  const confirmation = await vscode.window.showWarningMessage(
    `Clear the local ChatGPT Project link for ${project.projectName}?`,
    { modal: true },
    "Clear Link",
  );
  if (confirmation !== "Clear Link") return;
  await saveLocalWorkspace(
    extensionContext,
    context,
    setProjectChatGptLink(state, project.projectId, undefined, undefined),
  );
}

async function openProjectChatGptLink(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
  projectId: unknown,
): Promise<void> {
  const state = readLocalWorkspace(extensionContext.globalState);
  const project = resolveProject(context, state, projectId);
  const url = project?.chatGptProjectUrl;
  if (!url) {
    void vscode.window.showInformationMessage("No ChatGPT Project is linked to this ANN project.");
    return;
  }
  await openExternal(url, "The configured ChatGPT Project URL could not be opened.");
}

async function openCurrentProjectChatGptLink(context: CommandContext): Promise<void> {
  const link = currentChatGptProject(context.getSnapshot());
  if (!link) {
    void vscode.window.showInformationMessage("No ChatGPT Project is linked to the current ANN project.");
    return;
  }
  await openExternal(link.url, "The configured ChatGPT Project URL could not be opened.");
}

async function openProject(context: CommandContext): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    await vscode.commands.executeCommand("annGuardian.projects.focus");
    return;
  }
  await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(root));
}

async function startAnn(context: CommandContext): Promise<void> {
  try {
    await context.refresh();
  } catch {
    void vscode.window.showErrorMessage(
      "ANN could not refresh the current project context. START was not opened and no project data was changed.",
    );
    return;
  }

  const result = context.startAnn();
  if (result.status === "unavailable") {
    const next = await vscode.window.showInformationMessage(
      "START ANN requires a current registered ANN project. Open a project from My Projects first.",
      "Open My Projects",
    );
    if (next === "Open My Projects") {
      await vscode.commands.executeCommand("annGuardian.projects.focus");
    }
  } else if (result.status === "error") {
    void vscode.window.showErrorMessage("ANN Mentor Console could not be opened. No project data was changed.");
  }
}

export function registerCommands(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): void {
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("annGuardian.refresh", () => context.refresh()),
    vscode.commands.registerCommand("annGuardian.openProject", () => openProject(context)),
    vscode.commands.registerCommand("annGuardian.configureUserProfile", () => configureUserProfile(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.loginGpt", () => loginGpt(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.openChatGpt", () => openExternal(CHATGPT_HOME_URL, "ChatGPT could not be opened.")),
    vscode.commands.registerCommand("annGuardian.setGptAccountLabel", () => setGptAccountLabel(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.changeGptAccount", () => changeGptAccount(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.clearGptAccountContext", () => clearGptAccountContext(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.selectGptAccountContext", (accountId) => selectGptAccountContext(extensionContext, context, accountId)),
    vscode.commands.registerCommand("annGuardian.registerCurrentProject", () => registerCurrentProject(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.openExistingProject", () => openExistingProject(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.newPersonalProject", () => newPersonalProject(extensionContext, context)),
    vscode.commands.registerCommand("annGuardian.openRegisteredProject", (projectId) => openRegisteredProject(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.removeRegisteredProject", (projectId) => removeRegisteredProject(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.mapProjectGptAccount", (projectId) => mapProjectGptAccount(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.configureProjectChatGptLink", (projectId) => configureProjectChatGptLink(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.clearProjectChatGptLink", (projectId) => clearProjectChatGptLink(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.openProjectChatGptLink", (projectId) => openProjectChatGptLink(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.openCurrentProjectChatGptLink", () => openCurrentProjectChatGptLink(context)),
    vscode.commands.registerCommand("annGuardian.configureChatGptMentor", (projectId) => configureProjectChatGptLink(extensionContext, context, projectId)),
    vscode.commands.registerCommand("annGuardian.openChatGptMentor", () => openCurrentProjectChatGptLink(context)),
    vscode.commands.registerCommand("annGuardian.startAnn", () => startAnn(context)),
    vscode.commands.registerCommand("annGuardian.runVerification", () => runVerification(context)),
    ...ANN_FILES.map((file) =>
      vscode.commands.registerCommand(file.command, () => openAnnFile(context, file.id)),
    ),
  );
}
