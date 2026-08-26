import * as vscode from "vscode";

import { currentGptAccount } from "./local-workspace";
import { AnnTreeItem, commandItem, contextItem } from "./tree-items";
import type { ControlRoomSnapshot } from "./view-model";

export class AccountCenterProvider implements vscode.TreeDataProvider<AnnTreeItem>, vscode.Disposable {
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

    const { profile, localWorkspace } = this.snapshot;
    const account = currentGptAccount(localWorkspace);
    const localUser = new AnnTreeItem("LOCAL USER", [
      contextItem(
        "Display name",
        profile.displayName ?? "Not configured — select to set locally",
        "annGuardian.configureUserProfile",
      ),
    ]);

    const accountDetails = account
      ? [
          contextItem("Account label", account.label),
          contextItem(
            "Browser login",
            account.browserLoginConfirmedAt ? "User confirmed" : "Not confirmed — login is browser-controlled",
          ),
          contextItem("ANN verification", "NOT VERIFIED BY ANN"),
        ]
      : [contextItem("Status", "Not configured — login or set a local label")];

    const accountActions = account
      ? [
          commandItem("Open ChatGPT", "annGuardian.openChatGpt"),
          commandItem("Change Account", "annGuardian.changeGptAccount"),
          commandItem("Edit Account Label", "annGuardian.setGptAccountLabel"),
          commandItem("Clear Current Account Context", "annGuardian.clearGptAccountContext"),
        ]
      : [
          commandItem("Login GPT", "annGuardian.loginGpt"),
          commandItem("Set Account Label", "annGuardian.setGptAccountLabel"),
        ];

    const savedAccounts = localWorkspace.gptAccounts.length > 0
      ? new AnnTreeItem(
          "SAVED LOCAL ACCOUNT LABELS",
          localWorkspace.gptAccounts.map((saved) =>
            contextItem(
              saved.label,
              saved.id === localWorkspace.currentGptAccountId ? "Current context" : "Available for project mapping",
              "annGuardian.selectGptAccountContext",
              "Local label only. ANN has not authenticated this ChatGPT account.",
              saved.id,
            )
          ),
          undefined,
          `${localWorkspace.gptAccounts.length} local label(s)`,
          undefined,
          false,
        )
      : undefined;

    return [
      localUser,
      new AnnTreeItem("GPT WEB ACCOUNT", accountDetails),
      new AnnTreeItem("ACCOUNT ACTIONS", accountActions),
      ...(savedAccounts ? [savedAccounts] : []),
      new AnnTreeItem(
        "PRIVACY",
        [
          contextItem("Browser session", "Owned by ChatGPT and your browser"),
          contextItem("Credentials", "Never read or stored by ANN"),
        ],
        undefined,
        "Labels and confirmation timestamps are local metadata, not authentication.",
        undefined,
        false,
      ),
    ];
  }

  public dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
