import * as vscode from "vscode";

import { ANN_FILES } from "./ann-files";
import { ControlRoomSnapshot, formatTaskStatus, nextActionFor } from "./view-model";

class AnnTreeItem extends vscode.TreeItem {
  public readonly children: readonly AnnTreeItem[];

  public constructor(
    label: string,
    children: readonly AnnTreeItem[] = [],
    command?: vscode.Command,
    description?: string,
    tooltip?: string,
    expanded = true,
  ) {
    super(
      label,
      children.length > 0
        ? expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.children = children;
    this.command = command;
    this.description = description;
    this.tooltip = tooltip;
  }
}

function command(label: string, commandId: string): vscode.Command {
  return { title: label, command: commandId };
}

function commandItem(label: string, commandId: string): AnnTreeItem {
  return new AnnTreeItem(label, [], command(label, commandId));
}

function contextValue(
  label: string,
  description: string,
  commandId?: string,
  tooltip?: string,
): AnnTreeItem {
  return new AnnTreeItem(
    label,
    [],
    commandId ? command(label, commandId) : undefined,
    description,
    tooltip,
  );
}

export class AnnTreeProvider implements vscode.TreeDataProvider<AnnTreeItem> {
  private readonly didChangeTreeData = new vscode.EventEmitter<AnnTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this.didChangeTreeData.event;
  private snapshot: ControlRoomSnapshot;

  public constructor() {
    this.snapshot = {
      profile: {},
      terminal: {
        shellLabel: "No project root",
        status: "unavailable",
        description: "Open an ANN project to establish the terminal root.",
      },
    };
  }

  public update(snapshot: ControlRoomSnapshot): void {
    this.snapshot = snapshot;
    this.didChangeTreeData.fire();
  }

  public getTreeItem(element: AnnTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: AnnTreeItem): AnnTreeItem[] {
    if (element) {
      return [...element.children];
    }

    const { projectRoot, state, git, profile, mentorLink, terminal } = this.snapshot;
    const waitingForProject = "Waiting for an ANN project";
    const currentContext: AnnTreeItem[] = [
      contextValue(
        "User",
        profile.displayName ?? "Not configured — select to set locally",
        "annGuardian.configureUserProfile",
        "Stored only in VS Code extension global state.",
      ),
      contextValue(
        "Project",
        state?.projectName ?? "No ANN project detected — open an ANN folder",
        projectRoot ? "annGuardian.openProject" : "workbench.action.files.openFolder",
      ),
      contextValue(
        "Root",
        projectRoot ?? "Open a folder containing .ann/MASTER_PLAN.md",
        projectRoot ? "annGuardian.openProject" : "workbench.action.files.openFolder",
        projectRoot,
      ),
      contextValue(
        git?.repository.providerLabel ?? "Repository",
        git?.repository.name ?? waitingForProject,
        undefined,
        git?.repository.remoteName ? `Read-only Git remote: ${git.repository.remoteName}` : undefined,
      ),
      contextValue("Branch", git?.branch.name ?? waitingForProject),
      contextValue(
        "Master Plan",
        projectRoot ? "Ready" : "Not detected — open an ANN project",
        projectRoot ? "annGuardian.openMasterPlan" : "workbench.action.files.openFolder",
        projectRoot
          ? "The .ann/MASTER_PLAN.md authority marker is present. This is not a Guardian decision."
          : undefined,
      ),
      contextValue(
        "Task",
        state
          ? state.status === "valid" && state.taskStatus
            ? `${state.task} • ${formatTaskStatus(state.taskStatus)}`
            : state.message ?? state.task
          : waitingForProject,
        state?.status === "valid" ? "annGuardian.openProjectState" : undefined,
      ),
      contextValue(
        "Terminal",
        `${terminal.shellLabel} • ${terminal.status === "ready" ? "Ready" : "Not ready"}`,
        undefined,
        terminal.description,
      ),
    ];

    if (mentorLink) {
      currentContext.push(
        new AnnTreeItem(
          "ChatGPT Mentor",
          [
            contextValue("Account label", mentorLink.accountLabel),
            contextValue("Project label", mentorLink.projectLabel),
            contextValue("Project URL", mentorLink.url, "annGuardian.openChatGptMentor", mentorLink.url),
            contextValue("Status", "CONFIGURED — NOT VERIFIED"),
          ],
          undefined,
          `${mentorLink.projectLabel} • CONFIGURED — NOT VERIFIED`,
          "This is a manual local link. ANN does not inspect browser sign-in or authenticate ChatGPT.",
          false,
        ),
      );
    } else {
      currentContext.push(
        contextValue(
          "ChatGPT Mentor",
          projectRoot
            ? "No project linked — select to configure"
            : "Waiting for an ANN project",
          projectRoot ? "annGuardian.configureChatGptMentor" : undefined,
          "No browser account, cookies, or session data is inspected.",
        ),
      );
    }

    const nextAction = nextActionFor(this.snapshot);
    const actions = [
      commandItem(
        profile.displayName ? "Edit Local User Label" : "Set Local User Label",
        "annGuardian.configureUserProfile",
      ),
      ...(projectRoot
        ? [
            commandItem("Open Project", "annGuardian.openProject"),
            commandItem(
              mentorLink ? "Edit ChatGPT Mentor Link" : "Link ChatGPT Project",
              "annGuardian.configureChatGptMentor",
            ),
            ...(mentorLink ? [commandItem("Open ChatGPT Mentor", "annGuardian.openChatGptMentor")] : []),
            commandItem("Run Verification", "annGuardian.runVerification"),
          ]
        : [commandItem("Open ANN Project Folder", "workbench.action.files.openFolder")]),
      commandItem("Refresh", "annGuardian.refresh"),
    ];

    return [
      new AnnTreeItem("CURRENT CONTEXT", currentContext),
      new AnnTreeItem(
        "NEXT ACTION",
        [
          new AnnTreeItem(
            nextAction.label,
            [],
            nextAction.command ? command(nextAction.label, nextAction.command) : undefined,
          ),
        ],
      ),
      new AnnTreeItem("ACTIONS", actions),
      new AnnTreeItem(
        "AUTHORITY & STATE",
        ANN_FILES.map((file) => commandItem(`Open ${file.label}`, file.command)),
        undefined,
        "Read-only project files",
        undefined,
        false,
      ),
    ];
  }

  public dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
