import * as vscode from "vscode";

import {
  mentorContextFromSnapshot,
  mentorTerminalTitle,
  type MentorConsoleContext,
} from "./mentor-console-model";
import {
  MENTOR_PROMPT,
  MentorConsoleSession,
  type MentorConsoleEffect,
} from "./mentor-console-session";
import {
  MentorSessionManager,
  type MentorSessionStartResult,
  type MentorSessionSyncResult,
} from "./mentor-session-manager";
import type { ControlRoomSnapshot } from "./view-model";

const CLEAR_ANN_CONSOLE = "\u001b[2J\u001b[3J\u001b[H";
const REPLACE_MASKED_INPUT_LINE = "\r\u001b[2K";

class AnnMentorPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  public readonly onDidWrite = this.writeEmitter.event;
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  public readonly onDidClose = this.closeEmitter.event;
  private readonly session = new MentorConsoleSession();
  private inputQueue: Promise<void> = Promise.resolve();
  private finished = false;

  public constructor(
    private readonly initialContext: MentorConsoleContext,
    private readonly getCurrentContext: () => MentorConsoleContext | undefined,
    private readonly refreshContext: () => Promise<void>,
    private readonly onClosed: () => void,
  ) {}

  public open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.apply(this.session.open(this.initialContext));
  }

  public close(): void {
    if (!this.finished) {
      this.finished = true;
      this.session.close();
      this.onClosed();
    }
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  public handleInput(data: string): void {
    if (this.finished) return;
    this.inputQueue = this.inputQueue
      .then(async () => {
        if (/[\r\n]/.test(data)) {
          try {
            await this.refreshContext();
          } catch {
            this.apply(this.session.fail());
            return;
          }
        }
        if (this.finished) return;
        this.apply(this.session.handleInput(data, this.getCurrentContext()));
      })
      .catch(() => {
        if (this.finished) return;
        this.apply(this.session.fail());
      });
  }

  private apply(effects: readonly MentorConsoleEffect[]): void {
    for (const effect of effects) {
      if (this.finished) return;
      if (effect.type === "write") {
        this.writeEmitter.fire(effect.text);
      } else if (effect.type === "commit-input") {
        this.writeEmitter.fire(`${REPLACE_MASKED_INPUT_LINE}${MENTOR_PROMPT}${effect.text}\r\n`);
      } else if (effect.type === "clear") {
        this.writeEmitter.fire(CLEAR_ANN_CONSOLE);
      } else {
        this.finish();
      }
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.session.close();
    this.onClosed();
    this.closeEmitter.fire(0);
  }
}

export class MentorConsoleController implements vscode.Disposable {
  private readonly sessions: MentorSessionManager;

  public constructor(
    private readonly getSnapshot: () => ControlRoomSnapshot,
    refreshSnapshot: () => Promise<void>,
  ) {
    this.sessions = new MentorSessionManager((context, onClosed) => {
      const pty = new AnnMentorPseudoterminal(
        context,
        () => mentorContextFromSnapshot(this.getSnapshot()),
        refreshSnapshot,
        onClosed,
      );
      const terminal = vscode.window.createTerminal({
        name: mentorTerminalTitle(context),
        pty,
        isTransient: true,
        location: vscode.TerminalLocation.Panel,
      });
      return {
        reveal: () => terminal.show(false),
        dispose: () => terminal.dispose(),
      };
    });
  }

  public start(): MentorSessionStartResult {
    try {
      return this.sessions.start(mentorContextFromSnapshot(this.getSnapshot()));
    } catch {
      return { status: "error" };
    }
  }

  public synchronize(): MentorSessionSyncResult {
    try {
      return this.sessions.synchronize(mentorContextFromSnapshot(this.getSnapshot()));
    } catch {
      return this.sessions.synchronize(undefined);
    }
  }

  public dispose(): void {
    this.sessions.dispose();
  }
}
