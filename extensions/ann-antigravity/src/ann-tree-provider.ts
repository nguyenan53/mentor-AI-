import * as vscode from "vscode";

import { ANN_FILES } from "./ann-files";
import { ControlRoomSnapshot } from "./view-model";

class AnnTreeItem extends vscode.TreeItem {
  public readonly children: readonly AnnTreeItem[];

  public constructor(
    label: string,
    children: readonly AnnTreeItem[] = [],
    command?: vscode.Command,
    description?: string,
  ) {
    super(
      label,
      children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    this.children = children;
    this.command = command;
    this.description = description;
  }
}

function commandItem(label: string, command: string): AnnTreeItem {
  return new AnnTreeItem(label, [], { title: label, command });
}

export class AnnTreeProvider implements vscode.TreeDataProvider<AnnTreeItem> {
  private readonly didChangeTreeData = new vscode.EventEmitter<AnnTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this.didChangeTreeData.event;
  private snapshot: ControlRoomSnapshot = {};

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

    const { projectRoot, state, branch } = this.snapshot;
    if (!projectRoot || !state || !branch) {
      return [new AnnTreeItem("No ANN project detected")];
    }

    const verificationDescription = state.verificationSummary
      ? `${state.verification}: ${state.verificationSummary}`
      : state.verification;
    const stateChildren = state.status === "valid"
      ? [
          new AnnTreeItem("Milestone", [], undefined, state.milestone),
          new AnnTreeItem("Task", [], undefined, state.task),
          new AnnTreeItem("Branch", [], undefined, branch.name),
          new AnnTreeItem("Verification", [], undefined, verificationDescription),
          new AnnTreeItem("Guardian", [], undefined, "NOT CONNECTED"),
        ]
      : [
          new AnnTreeItem("Project State", [], undefined, state.message ?? state.status),
          new AnnTreeItem("Branch", [], undefined, branch.name),
          new AnnTreeItem("Guardian", [], undefined, "NOT CONNECTED"),
        ];

    return [
      new AnnTreeItem("PROJECT", [
        new AnnTreeItem(state.projectName),
        new AnnTreeItem("Root", [], undefined, projectRoot),
      ]),
      new AnnTreeItem("STATE", stateChildren),
      new AnnTreeItem(
        "AUTHORITY",
        ANN_FILES.filter((file) => file.governance).map((file) => commandItem(file.label, file.command)),
      ),
      new AnnTreeItem("ACTIONS", [
        commandItem("Refresh", "annGuardian.refresh"),
        ...ANN_FILES.map((file) => commandItem(`Open ${file.label}`, file.command)),
        commandItem("Run Verification", "annGuardian.runVerification"),
      ]),
    ];
  }

  public dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
