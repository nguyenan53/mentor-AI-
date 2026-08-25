import path from "node:path";

import * as vscode from "vscode";

import { ANN_FILES, AnnFileId, getAnnFile } from "./ann-files";

export interface CommandContext {
  getProjectRoot(): string | undefined;
  refresh(): Promise<void>;
}

async function openAnnFile(context: CommandContext, fileId: AnnFileId): Promise<void> {
  const projectRoot = context.getProjectRoot();
  if (!projectRoot) {
    void vscode.window.showInformationMessage("No ANN project is detected in the current workspace.");
    return;
  }

  const descriptor = getAnnFile(fileId);
  const fileUri = vscode.Uri.file(path.join(projectRoot, ...descriptor.relativePath.split("/")));
  try {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document, { preview: false });
  } catch {
    void vscode.window.showWarningMessage(`${descriptor.label} is not available at ${descriptor.relativePath}.`);
  }
}

async function runVerification(context: CommandContext): Promise<void> {
  const projectRoot = context.getProjectRoot();
  if (!projectRoot) {
    void vscode.window.showInformationMessage("No ANN project is detected in the current workspace.");
    return;
  }

  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage("Trust this workspace before running ANN verification.");
    return;
  }

  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const execution = new vscode.ProcessExecution(npmExecutable, ["run", "check"], { cwd: projectRoot });
  const task = new vscode.Task(
    { type: "ann-verification" },
    vscode.TaskScope.Workspace,
    "ANN: Run Verification",
    "ANN Guardian Control Room",
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

export function registerCommands(
  extensionContext: vscode.ExtensionContext,
  context: CommandContext,
): void {
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("annGuardian.refresh", () => context.refresh()),
    vscode.commands.registerCommand("annGuardian.runVerification", () => runVerification(context)),
    ...ANN_FILES.map((file) =>
      vscode.commands.registerCommand(file.command, () => openAnnFile(context, file.id)),
    ),
  );
}
