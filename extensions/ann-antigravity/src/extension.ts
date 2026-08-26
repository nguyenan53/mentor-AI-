import * as vscode from "vscode";

import { AccountCenterProvider } from "./account-center-provider";
import { AnnTreeProvider } from "./ann-tree-provider";
import { registerCommands } from "./commands";
import { readGitContext } from "./git-branch";
import { projectByRoot, readLocalWorkspace } from "./local-workspace";
import { chooseAnnProjectRoot, detectAnnProjectRoots } from "./project-detector";
import { inspectProjectRoot } from "./project-root-status";
import { ProjectsTreeProvider } from "./projects-tree-provider";
import { readProjectState } from "./state-reader";
import { AnnStatusBar } from "./status-bar";
import { describeTerminalReadiness } from "./terminal-readiness";
import { readChatGptMentorLink, readLocalUserProfile } from "./user-settings";
import { WATCHED_ANN_PATHS } from "./ann-files";
import { ControlRoomSnapshot } from "./view-model";

class AnnControlRoom implements vscode.Disposable {
  private readonly treeProvider: AnnTreeProvider;
  private readonly accountCenterProvider: AccountCenterProvider;
  private readonly projectsTreeProvider: ProjectsTreeProvider;
  private readonly statusBar = new AnnStatusBar();
  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private currentSnapshot: ControlRoomSnapshot;
  private debounceTimer: NodeJS.Timeout | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {
    const localWorkspace = readLocalWorkspace(context.globalState);
    this.currentSnapshot = {
      profile: readLocalUserProfile(context.globalState),
      terminal: describeTerminalReadiness(undefined, vscode.env.shell),
      localWorkspace,
      registeredProjects: [],
    };
    this.treeProvider = new AnnTreeProvider(this.currentSnapshot);
    this.accountCenterProvider = new AccountCenterProvider(this.currentSnapshot);
    this.projectsTreeProvider = new ProjectsTreeProvider(this.currentSnapshot);
    this.disposables.push(
      this.treeProvider,
      this.accountCenterProvider,
      this.projectsTreeProvider,
      this.statusBar,
      vscode.window.registerTreeDataProvider("annGuardian.controlRoom", this.treeProvider),
      vscode.window.registerTreeDataProvider("annGuardian.accountCenter", this.accountCenterProvider),
      vscode.window.registerTreeDataProvider("annGuardian.projects", this.projectsTreeProvider),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.rebuildWatchers();
        this.scheduleRefresh();
      }),
    );
    this.rebuildWatchers();
    registerCommands(context, {
      getSnapshot: () => this.currentSnapshot,
      refresh: () => this.refresh(),
    });
  }

  public async refresh(): Promise<void> {
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const localWorkspace = readLocalWorkspace(this.context.globalState);
    const detectedRoots = await detectAnnProjectRoots(workspaceRoots);
    const activeFile = vscode.window.activeTextEditor?.document.uri.scheme === "file"
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : undefined;
    const registeredWorkspaceRoots = workspaceRoots.filter((root) => projectByRoot(localWorkspace, root));
    const projectRoot = chooseAnnProjectRoot(
      detectedRoots.length > 0 ? detectedRoots : registeredWorkspaceRoots,
      activeFile,
    );

    const profile = readLocalUserProfile(this.context.globalState);
    const registeredProjects = await Promise.all(
      localWorkspace.projects.map(async (project) => ({
        project,
        inspection: await inspectProjectRoot(project.projectRoot),
      })),
    );
    let snapshot: ControlRoomSnapshot = {
      profile,
      terminal: describeTerminalReadiness(undefined, vscode.env.shell),
      localWorkspace,
      registeredProjects,
    };
    if (projectRoot) {
      const state = await readProjectState(projectRoot);
      const git = await readGitContext(projectRoot, state.activeBranch);
      const mentorLink = readChatGptMentorLink(this.context.globalState, projectRoot);
      const currentRegisteredProject = projectByRoot(localWorkspace, projectRoot);
      const currentProjectInspection = currentRegisteredProject
        ? registeredProjects.find(({ project }) => project.projectId === currentRegisteredProject.projectId)?.inspection
          ?? await inspectProjectRoot(projectRoot)
        : await inspectProjectRoot(projectRoot);
      snapshot = {
        projectRoot,
        state,
        git,
        profile,
        mentorLink,
        terminal: describeTerminalReadiness(projectRoot, vscode.env.shell),
        localWorkspace,
        currentRegisteredProject,
        currentProjectInspection,
        registeredProjects,
      };
    }

    this.currentSnapshot = snapshot;
    this.treeProvider.update(snapshot);
    this.accountCenterProvider.update(snapshot);
    this.projectsTreeProvider.update(snapshot);
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
