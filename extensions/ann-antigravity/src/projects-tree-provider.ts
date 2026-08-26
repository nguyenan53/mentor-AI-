import * as vscode from "vscode";

import { gptAccountById } from "./local-workspace";
import { AnnTreeItem, commandItem, contextItem } from "./tree-items";
import type { ControlRoomSnapshot, RegisteredProjectDisplay } from "./view-model";

function projectItem(snapshot: ControlRoomSnapshot, display: RegisteredProjectDisplay): AnnTreeItem {
  const { project, inspection } = display;
  const account = gptAccountById(snapshot.localWorkspace, project.gptAccountId);
  const chatGptProject = project.chatGptProjectLabel
    ? `${project.chatGptProjectLabel} • CONFIGURED — NOT VERIFIED`
    : "Not linked — select to configure";
  const canOpen = inspection.status !== "missing-root" && inspection.status !== "unavailable";

  return new AnnTreeItem(
    project.projectName,
    [
      contextItem("Root", project.projectRoot, canOpen ? "annGuardian.openRegisteredProject" : undefined, project.projectRoot, project.projectId),
      contextItem("Master Plan", inspection.masterPlanLabel),
      contextItem(
        "GPT account",
        account?.label ?? "Not mapped — select an account context",
        "annGuardian.mapProjectGptAccount",
        "Local account context only; never authenticated by ANN.",
        project.projectId,
      ),
      contextItem(
        "ChatGPT Project",
        chatGptProject,
        "annGuardian.configureProjectChatGptLink",
        project.chatGptProjectUrl,
        project.projectId,
      ),
      contextItem("Last opened", project.lastOpenedAt),
      ...(canOpen
        ? [commandItem("Open", "annGuardian.openRegisteredProject", project.projectId)]
        : [commandItem("Remove Missing Entry", "annGuardian.removeRegisteredProject", project.projectId)]),
      commandItem(
        project.chatGptProjectUrl ? "Change ChatGPT Project Link" : "Link ChatGPT Project",
        "annGuardian.configureProjectChatGptLink",
        project.projectId,
      ),
      ...(project.chatGptProjectUrl
        ? [
            commandItem("Open ChatGPT Project", "annGuardian.openProjectChatGptLink", project.projectId),
            commandItem("Clear ChatGPT Project Link", "annGuardian.clearProjectChatGptLink", project.projectId),
          ]
        : []),
      commandItem("Remove from My Projects", "annGuardian.removeRegisteredProject", project.projectId),
    ],
    undefined,
    inspection.status === "ready" ? "Master Plan: Ready" : inspection.masterPlanLabel,
    project.projectRoot,
    false,
    "annRegisteredProject",
  );
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<AnnTreeItem>, vscode.Disposable {
  private readonly didChangeTreeData = new vscode.EventEmitter<AnnTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this.didChangeTreeData.event;
  private snapshot: ControlRoomSnapshot;

  public constructor(initialSnapshot: ControlRoomSnapshot) {
    this.snapshot = initialSnapshot;
  }

  public update(snapshot: ControlRoomSnapshot): void {
    this.snapshot = snapshot;
    this.didChangeTreeData.fire();
  }

  public getTreeItem(element: AnnTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: AnnTreeItem): AnnTreeItem[] {
    if (element) return [...element.children];

    const projects = this.snapshot.registeredProjects;
    return [
      ...(projects.length > 0
        ? projects.map((display) => projectItem(this.snapshot, display))
        : [
            new AnnTreeItem(
              "No personal ANN projects registered",
              [
                commandItem("Open Existing ANN Project", "annGuardian.openExistingProject"),
                commandItem("New Personal Project", "annGuardian.newPersonalProject"),
              ],
            ),
          ]),
      new AnnTreeItem("PROJECT ACTIONS", [
        commandItem("New Personal Project", "annGuardian.newPersonalProject"),
        commandItem("Open Existing ANN Project", "annGuardian.openExistingProject"),
        ...(this.snapshot.projectRoot && !this.snapshot.currentRegisteredProject
          ? [commandItem("Add Current Project to My Projects", "annGuardian.registerCurrentProject")]
          : []),
      ]),
    ];
  }

  public dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
