import type { MentorConsoleContext } from "./mentor-console-model";
import type { MentorUiSessionState } from "./mentor-console-session";

export interface MentorSessionPort {
  reveal(): void;
  dispose(): void;
}

export type MentorSessionPortFactory = (
  context: MentorConsoleContext,
  onClosed: () => void,
) => MentorSessionPort;

export type MentorSessionStartResult =
  | { readonly status: "unavailable" }
  | { readonly status: "opened" | "reused" | "replaced" }
  | { readonly status: "error" };

export type MentorSessionSyncResult = "unchanged" | "closed-stale";

interface ActiveSession {
  readonly token: symbol;
  readonly projectKey: string;
  readonly port: MentorSessionPort;
}

export class MentorSessionManager {
  private active: ActiveSession | undefined;
  private lifecycle: MentorUiSessionState = "IDLE";

  public constructor(private readonly createPort: MentorSessionPortFactory) {}

  public get state(): MentorUiSessionState {
    return this.lifecycle;
  }

  public get activeProjectKey(): string | undefined {
    return this.active?.projectKey;
  }

  public start(context: MentorConsoleContext | undefined): MentorSessionStartResult {
    if (!context) return { status: "unavailable" };

    if (this.active?.projectKey === context.projectKey) {
      const existing = this.active;
      try {
        existing.port.reveal();
        this.lifecycle = "READY";
        return { status: "reused" };
      } catch {
        this.active = undefined;
        try {
          existing.port.dispose();
        } catch {
          // The failed port is already detached from the manager.
        }
        this.lifecycle = "ERROR";
        return { status: "error" };
      }
    }

    const replaced = Boolean(this.active);
    this.disposeActive();

    const token = Symbol("ann-mentor-session");
    let port: MentorSessionPort | undefined;
    try {
      port = this.createPort(context, () => this.detach(token));
      this.active = { token, projectKey: context.projectKey, port };
      this.lifecycle = "READY";
      port.reveal();
      return { status: replaced ? "replaced" : "opened" };
    } catch {
      this.active = undefined;
      if (port) {
        try {
          port.dispose();
        } catch {
          // The failed port is already detached from the manager.
        }
      }
      this.lifecycle = "ERROR";
      return { status: "error" };
    }
  }

  public synchronize(context: MentorConsoleContext | undefined): MentorSessionSyncResult {
    if (!this.active || this.active.projectKey === context?.projectKey) return "unchanged";
    this.disposeActive();
    return "closed-stale";
  }

  public dispose(): void {
    this.disposeActive();
    this.lifecycle = "CLOSED";
  }

  private detach(token: symbol): void {
    if (this.active?.token !== token) return;
    this.active = undefined;
    this.lifecycle = "CLOSED";
  }

  private disposeActive(): void {
    const session = this.active;
    this.active = undefined;
    if (!session) return;
    this.lifecycle = "CLOSED";
    try {
      session.port.dispose();
    } catch {
      this.lifecycle = "ERROR";
    }
  }
}
