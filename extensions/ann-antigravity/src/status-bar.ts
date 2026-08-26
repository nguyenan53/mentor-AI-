import * as vscode from "vscode";

import { ControlRoomSnapshot, formatTaskStatus } from "./view-model";

export class AnnStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  public constructor() {
    this.item.command = "annGuardian.refresh";
    this.item.name = "ANN Home";
  }

  public update(snapshot: ControlRoomSnapshot): void {
    const { projectRoot, state } = snapshot;
    if (!projectRoot || !state) {
      this.item.hide();
      return;
    }

    if (state.status === "missing") {
      this.item.text = "$(shield) ANN: detected | state not initialized";
    } else if (state.status === "malformed") {
      this.item.text = "$(warning) ANN: detected | state malformed";
    } else if (state.status === "unavailable") {
      this.item.text = "$(warning) ANN: detected | state unavailable";
    } else {
      const taskStatus = state.taskStatus ? ` • ${formatTaskStatus(state.taskStatus)}` : "";
      this.item.text = `$(home) ANN: ${state.task}${taskStatus} | Verify: ${state.verification}`;
    }

    this.item.tooltip = `ANN Home\n${state.projectName}\n${projectRoot}`;
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
