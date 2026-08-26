import * as vscode from "vscode";

export class AnnTreeItem extends vscode.TreeItem {
  public readonly children: readonly AnnTreeItem[];

  public constructor(
    label: string,
    children: readonly AnnTreeItem[] = [],
    command?: vscode.Command,
    description?: string,
    tooltip?: string,
    expanded = true,
    contextValue?: string,
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
    this.contextValue = contextValue;
  }
}

export function treeCommand(
  label: string,
  commandId: string,
  ...args: readonly unknown[]
): vscode.Command {
  return { title: label, command: commandId, arguments: [...args] };
}

export function commandItem(
  label: string,
  commandId: string,
  ...args: readonly unknown[]
): AnnTreeItem {
  return new AnnTreeItem(label, [], treeCommand(label, commandId, ...args));
}

export function contextItem(
  label: string,
  description: string,
  commandId?: string,
  tooltip?: string,
  ...args: readonly unknown[]
): AnnTreeItem {
  return new AnnTreeItem(
    label,
    [],
    commandId ? treeCommand(label, commandId, ...args) : undefined,
    description,
    tooltip,
  );
}
