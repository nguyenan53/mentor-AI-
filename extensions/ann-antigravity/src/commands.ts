import path from "node:path";

import * as vscode from "vscode";

import { ANN_FILES, AnnFileId, getAnnFile } from "./ann-files";
import {
  ChatGptMentorLink,
  LocalUserProfile,
  USER_PROFILE_STORAGE_KEY,
  mentorLinkStorageKey,
  normalizeChatGptUrl,
  normalizeLocalLabel,
  readChatGptMentorLink,
  readLocalUserProfile,
} from "./user-settings";
import { ControlRoomSnapshot } from "./view-model";

export interface CommandContext {
  getSnapshot(): ControlRoomSnapshot;
  refresh(): Promise<void>;
}

function projectRoot(context: CommandContext): string | undefined {
  return context.getSnapshot().projectRoot;
}

async function openAnnFile(context: CommandContext, fileId: AnnFileId): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    void vscode.window.showInformationMessage("Open a folder containing .ann/MASTER_PLAN.md first.");
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
    void vscode.window.showInformationMessage("Open a folder containing .ann/MASTER_PLAN.md first.");
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

function requiredLabelMessage(value: string): string | undefined {
  return normalizeLocalLabel(value) ? undefined : "Enter a non-empty label.";
}

function chatGptUrlMessage(value: string): string | undefined {
  return normalizeChatGptUrl(value)
    ? undefined
    : "Enter an HTTPS chatgpt.com project or chat URL without embedded credentials.";
}

async function configureUserProfile(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const current = readLocalUserProfile(extensionContext.globalState);
  const displayName = await vscode.window.showInputBox({
    title: "ANN Local User Profile",
    prompt: "Enter the label ANN should show for you on this machine.",
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

async function configureChatGptMentor(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    void vscode.window.showInformationMessage("Open an ANN project before linking ChatGPT Mentor.");
    return;
  }

  const current = readChatGptMentorLink(extensionContext.globalState, root);
  const accountLabel = await vscode.window.showInputBox({
    title: "ChatGPT Mentor — Account Label",
    prompt: "Enter a display label only. ANN will not inspect or verify browser sign-in.",
    placeHolder: "My ChatGPT account",
    value: current?.accountLabel,
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  if (accountLabel === undefined) return;

  const projectLabel = await vscode.window.showInputBox({
    title: "ChatGPT Mentor — Project Label",
    prompt: "Enter the ChatGPT project or chat label shown in ANN.",
    placeHolder: "ANN Mentor",
    value: current?.projectLabel,
    ignoreFocusOut: true,
    validateInput: requiredLabelMessage,
  });
  if (projectLabel === undefined) return;

  const url = await vscode.window.showInputBox({
    title: "ChatGPT Mentor — Project or Chat URL",
    prompt: "Paste an HTTPS chatgpt.com project or chat URL. ANN will open it only when you ask.",
    placeHolder: "https://chatgpt.com/g/g-p-.../project",
    value: current?.url,
    ignoreFocusOut: true,
    validateInput: chatGptUrlMessage,
  });
  if (url === undefined) return;

  const normalizedAccount = normalizeLocalLabel(accountLabel);
  const normalizedProject = normalizeLocalLabel(projectLabel);
  const normalizedUrl = normalizeChatGptUrl(url);
  if (!normalizedAccount || !normalizedProject || !normalizedUrl) return;

  const mentorLink: ChatGptMentorLink = {
    accountLabel: normalizedAccount,
    projectLabel: normalizedProject,
    url: normalizedUrl,
  };

  try {
    await extensionContext.globalState.update(mentorLinkStorageKey(root), mentorLink);
  } catch {
    void vscode.window.showErrorMessage("ANN could not save the local ChatGPT Mentor link.");
    return;
  }
  await context.refresh();
}

async function openChatGptMentor(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): Promise<void> {
  const root = projectRoot(context);
  const mentorLink = root
    ? readChatGptMentorLink(extensionContext.globalState, root)
    : undefined;
  if (!mentorLink) {
    void vscode.window.showInformationMessage("No ChatGPT Mentor project is linked for the current ANN project.");
    return;
  }

  try {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(mentorLink.url));
    if (opened) return;
  } catch {
    // Report one value-free error below. The configured URL is never logged.
  }

  void vscode.window.showErrorMessage("The configured ChatGPT Mentor URL could not be opened.");
}

async function openProject(context: CommandContext): Promise<void> {
  const root = projectRoot(context);
  if (!root) {
    await vscode.commands.executeCommand("workbench.action.files.openFolder");
    return;
  }

  await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(root));
}

export function registerCommands(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): void {
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("annGuardian.refresh", () => context.refresh()),
    vscode.commands.registerCommand("annGuardian.openProject", () => openProject(context)),
    vscode.commands.registerCommand(
      "annGuardian.configureUserProfile",
      () => configureUserProfile(extensionContext, context),
    ),
    vscode.commands.registerCommand(
      "annGuardian.configureChatGptMentor",
      () => configureChatGptMentor(extensionContext, context),
    ),
    vscode.commands.registerCommand(
      "annGuardian.openChatGptMentor",
      () => openChatGptMentor(extensionContext, context),
    ),
    vscode.commands.registerCommand("annGuardian.runVerification", () => runVerification(context)),
    ...ANN_FILES.map((file) =>
      vscode.commands.registerCommand(file.command, () => openAnnFile(context, file.id)),
    ),
  );
}
