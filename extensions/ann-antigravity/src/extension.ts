import * as vscode from "vscode";

import { AnnTreeProvider } from "./ann-tree-provider";
import { registerCommands } from "./commands";
import { readBranch } from "./git-branch";
import { chooseAnnProjectRoot, detectAnnProjectRoots } from "./project-detector";
import { readProjectState } from "./state-reader";
import { AnnStatusBar } from "./status-bar";
import { WATCHED_ANN_PATHS } from "./ann-files";
import { ControlRoomSnapshot } from "./view-model";

class AnnControlRoom implements vscode.Disposable {
  private readonly treeProvider = new AnnTreeProvider();
  private readonly statusBar = new AnnStatusBar();
  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private currentSnapshot: ControlRoomSnapshot = {};
  private debounceTimer: NodeJS.Timeout | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      this.treeProvider,
      this.statusBar,
      vscode.window.registerTreeDataProvider("annGuardian.controlRoom", this.treeProvider),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.rebuildWatchers();
        this.scheduleRefresh();
      }),
    );
    this.rebuildWatchers();
    registerCommands(context, {
      getProjectRoot: () => this.currentSnapshot.projectRoot,
      refresh: () => this.refresh(),
    });
  }

  public async refresh(): Promise<void> {
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const detectedRoots = await detectAnnProjectRoots(workspaceRoots);
    const activeFile = vscode.window.activeTextEditor?.document.uri.scheme === "file"
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : undefined;
    const projectRoot = chooseAnnProjectRoot(detectedRoots, activeFile);

    let snapshot: ControlRoomSnapshot = {};
    if (projectRoot) {
      const state = await readProjectState(projectRoot);
      const branch = await readBranch(projectRoot, state.activeBranch);
      snapshot = { projectRoot, state, branch };
    }

    this.currentSnapshot = snapshot;
    this.treeProvider.update(snapshot);
    this.statusBar.update(snapshot);
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refresh();
    }, 150);
  }

  private rebuildWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const relativePath of WATCHED_ANN_PATHS) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, relativePath));
        watcher.onDidCreate(() => this.scheduleRefresh());
        watcher.onDidChange(() => this.scheduleRefresh());
        watcher.onDidDelete(() => this.scheduleRefresh());
        this.watchers.push(watcher);
      }
    }
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const controlRoom = new AnnControlRoom(context);
  context.subscriptions.push(controlRoom);
  void controlRoom.refresh();
}

export function deactivate(): void {
  // Resources are owned by ExtensionContext subscriptions.
}
