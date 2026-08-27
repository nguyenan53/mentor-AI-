import * as vscode from "vscode";

import { ANN_FILES } from "./ann-files";
import { gptAccountById } from "./local-workspace";
import { AnnTreeItem, commandItem, contextItem, treeCommand } from "./tree-items";
import {
  accountForCurrentProject,
  currentChatGptProject,
  formatTaskStatus,
  nextActionFor,
  type ControlRoomSnapshot,
} from "./view-model";

export class AnnTreeProvider implements vscode.TreeDataProvider<AnnTreeItem>, vscode.Disposable {
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

    const {
      projectRoot,
      state,
      git,
      profile,
      terminal,
      currentRegisteredProject,
      currentProjectInspection,
      localWorkspace,
    } = this.snapshot;
    const account = accountForCurrentProject(this.snapshot);
    const mappedAccount = gptAccountById(localWorkspace, currentRegisteredProject?.gptAccountId);
    const chatGptProject = currentChatGptProject(this.snapshot);

    const userSection = new AnnTreeItem("USER", [
      contextItem(
        "Local user",
        profile.displayName ?? "Not configured — select to set locally",
        "annGuardian.configureUserProfile",
        "Stored only in VS Code extension global state.",
      ),
      commandItem("Open Account Center", "annGuardian.accountCenter.focus"),
    ]);

    const gptAccountSection = new AnnTreeItem(
      "GPT WEB ACCOUNT",
      account
        ? [
            contextItem("Account label", account.label, "annGuardian.accountCenter.focus"),
            contextItem(
              "Browser login",
              account.browserLoginConfirmedAt ? "User confirmed" : "Not confirmed — use Login GPT",
              account.browserLoginConfirmedAt ? undefined : "annGuardian.loginGpt",
            ),
            contextItem("ANN verification", "NOT VERIFIED BY ANN"),
            contextItem(
              "Project mapping",
              mappedAccount
                ? "Mapped to current ANN project"
                : currentRegisteredProject
                  ? "Not mapped — select a local account context"
                  : "Register the current project to store a mapping",
              currentRegisteredProject ? "annGuardian.mapProjectGptAccount" : undefined,
              undefined,
              currentRegisteredProject?.projectId,
            ),
          ]
        : [
            contextItem(
              "Status",
              "No GPT account context configured — select to login",
              "annGuardian.loginGpt",
              "ANN opens ChatGPT in your browser but never reads the browser session.",
            ),
          ],
    );

    const annProjectSection = projectRoot
      ? new AnnTreeItem("CURRENT PROJECT", [
          contextItem("Project", currentRegisteredProject?.projectName ?? state?.projectName ?? "Project name unavailable"),
          ...(currentRegisteredProject
            ? [commandItem("▶ START ANN", "annGuardian.startAnn")]
            : [
                contextItem(
                  "START ANN",
                  "Unavailable — register this project in My Projects first",
                  "annGuardian.startAnn",
                ),
              ]),
          contextItem("Root", projectRoot, "annGuardian.openProject", projectRoot),
          contextItem(
            "Personal registry",
            currentRegisteredProject ? "Registered in My Projects" : "Not registered — select to add locally",
            currentRegisteredProject ? "annGuardian.projects.focus" : "annGuardian.registerCurrentProject",
          ),
          contextItem(
            git?.repository.providerLabel ?? "Repository",
            git?.repository.name ?? "Not detected — add a remote with Git tools",
          ),
          contextItem("Branch", git?.branch.name ?? "Not detected — open this project as a Git repository"),
          contextItem(
            "Terminal",
            `${terminal.shellLabel} • ${terminal.status === "ready" ? "Ready" : "Not ready"}`,
            undefined,
            terminal.description,
          ),
        ])
      : new AnnTreeItem("CURRENT PROJECT", [
          contextItem(
            "Status",
            "No ANN project selected — open an existing project or start the wizard",
            "annGuardian.openExistingProject",
          ),
          commandItem("Open My Projects", "annGuardian.projects.focus"),
          commandItem("▶ START ANN", "annGuardian.startAnn"),
          commandItem("New Personal Project", "annGuardian.newPersonalProject"),
        ]);

    const chatGptSection = new AnnTreeItem(
      "CHATGPT PROJECT",
      projectRoot
        ? chatGptProject
          ? [
              contextItem("Project label", chatGptProject.label),
              contextItem("Project URL", chatGptProject.url, "annGuardian.openCurrentProjectChatGptLink", chatGptProject.url),
              contextItem("State", "CONFIGURED — NOT VERIFIED"),
              commandItem("Change Link", "annGuardian.configureProjectChatGptLink", currentRegisteredProject?.projectId),
            ]
          : [
              contextItem(
                "Status",
                currentRegisteredProject
                  ? "No ChatGPT Project linked — select to configure"
                  : "Register this ANN project before linking ChatGPT",
                currentRegisteredProject
                  ? "annGuardian.configureProjectChatGptLink"
                  : "annGuardian.registerCurrentProject",
                undefined,
                currentRegisteredProject?.projectId,
              ),
            ]
        : [contextItem("Status", "Waiting for an ANN project")],
    );

    const masterPlanSection = new AnnTreeItem("MASTER PLAN", [
      contextItem(
        "Status",
        currentProjectInspection?.masterPlanLabel ?? "No ANN project selected",
        currentProjectInspection?.status === "ready" ? "annGuardian.openMasterPlan" : undefined,
        currentProjectInspection?.status === "ready"
          ? "The authority marker exists. This is not a Guardian decision."
          : "UX1 never creates or overwrites project governance.",
      ),
    ]);

    const taskDescription = state
      ? state.status === "valid" && state.taskStatus
        ? `${state.task} • ${formatTaskStatus(state.taskStatus)}`
        : state.message ?? state.task
      : "Waiting for an ANN project";
    const taskSection = new AnnTreeItem("TASK", [
      contextItem(
        "Current task",
        taskDescription,
        state?.status === "valid" ? "annGuardian.openProjectState" : undefined,
      ),
    ]);

    const nextAction = nextActionFor(this.snapshot);
    const actions = [
      commandItem("Open Account Center", "annGuardian.accountCenter.focus"),
      commandItem("Open My Projects", "annGuardian.projects.focus"),
      ...(projectRoot
        ? [
            commandItem("Open Project", "annGuardian.openProject"),
            ...(currentProjectInspection?.status === "ready"
              ? [commandItem("Run Verification", "annGuardian.runVerification")]
              : []),
            ...(!currentRegisteredProject
              ? [commandItem("Add Current Project to My Projects", "annGuardian.registerCurrentProject")]
              : []),
          ]
        : [
            commandItem("Open Existing ANN Project", "annGuardian.openExistingProject"),
            commandItem("New Personal Project", "annGuardian.newPersonalProject"),
          ]),
      commandItem("Refresh", "annGuardian.refresh"),
    ];

    return [
      userSection,
      gptAccountSection,
      annProjectSection,
      chatGptSection,
      masterPlanSection,
      taskSection,
      new AnnTreeItem("NEXT ACTION", [
        new AnnTreeItem(
          nextAction.label,
          [],
          nextAction.command ? treeCommand(nextAction.label, nextAction.command) : undefined,
        ),
      ]),
      new AnnTreeItem("ACTIONS", actions),
      ...(currentProjectInspection?.status === "ready"
        ? [
            new AnnTreeItem(
              "AUTHORITY & STATE",
              ANN_FILES.map((file) => commandItem(`Open ${file.label}`, file.command)),
              undefined,
              "Read-only project files",
              undefined,
              false,
            ),
          ]
        : []),
    ];
  }

  public dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
