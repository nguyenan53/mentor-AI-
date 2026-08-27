import {
  MASTER_PLAN_IMPORT_RESPONSE,
  NATURAL_REQUEST_RESPONSE,
  renderMentorBanner,
  renderMentorHelp,
  renderMentorPlan,
  renderMentorProject,
  renderMentorStatus,
  renderMentorTask,
  sanitizeTerminalLine,
  type MentorConsoleContext,
} from "./mentor-console-model";
import { containsCredentialLikeText } from "./user-settings";

export type MentorUiSessionState = "IDLE" | "READY" | "CLOSED" | "ERROR";
export type MentorIntent = "status" | "project" | "plan" | "task" | "help" | "clear" | "exit" | "master-plan-import" | "request";

export type MentorConsoleEffect =
  | { readonly type: "write"; readonly text: string }
  | { readonly type: "commit-input"; readonly text: string }
  | { readonly type: "clear" }
  | { readonly type: "close" };

type EscapeMode = "normal" | "escape" | "csi" | "ss3" | "string" | "string-escape";

export const MENTOR_PROMPT = "ANN > ";
const CRLF = "\r\n";
const DEFAULT_MAX_INPUT_LENGTH = 4096;
const MASKED_INPUT_CHARACTER = "•";
const CREDENTIAL_REDACTION = "[credential-like input redacted]";
const REQUEST_MARKER = "[request received]";
const MASTER_PLAN_INPUT_MARKER = "[Master Plan input withheld]";
const PRIVATE_KEY_BEGIN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const PRIVATE_KEY_END = /-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

const COMMANDS = new Map<string, MentorIntent>([
  ["/status", "status"],
  ["/project", "project"],
  ["/plan", "plan"],
  ["/task", "task"],
  ["/help", "help"],
  ["/clear", "clear"],
  ["/exit", "exit"],
]);

const ALIASES = new Map<string, MentorIntent>([
  ["status", "status"],
  ["current status", "status"],
  ["tinh trang hien tai", "status"],
  ["dang toi dau", "status"],
  ["trang thai", "status"],
  ["current project", "project"],
  ["project hien tai", "project"],
  ["du an hien tai", "project"],
  ["master plan", "plan"],
  ["ke hoach tong the", "plan"],
  ["current task", "task"],
  ["task hien tai", "task"],
  ["tac vu hien tai", "task"],
  ["help", "help"],
  ["tro giup", "help"],
  ["clear", "clear"],
  ["xoa man hinh", "clear"],
  ["exit", "exit"],
  ["thoat", "exit"],
  ["dong ann", "exit"],
]);

function normalizedPhrase(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeMasterPlanInput(value: string): boolean {
  const normalized = normalizedPhrase(value).replaceAll("\\", "/");
  if (normalized.includes(".ann/master_plan.md") || normalized.includes("master_plan.md")) return true;
  if (normalized.startsWith("# ann master plan")) return true;
  return /\b(?:import|paste|write|create|ghi|tao|nhap)\b.*\bmaster plan\b/.test(normalized);
}

export function resolveMentorIntent(value: string): MentorIntent {
  const command = value.trim().toLowerCase();
  const canonical = COMMANDS.get(command);
  if (canonical) return canonical;

  const alias = ALIASES.get(normalizedPhrase(value));
  if (alias) return alias;
  return looksLikeMasterPlanInput(value) ? "master-plan-import" : "request";
}

function committedInputFor(intent: MentorIntent | undefined): string {
  switch (intent) {
    case "status":
    case "project":
    case "plan":
    case "task":
    case "help":
    case "clear":
    case "exit":
      return `/${intent}`;
    case "master-plan-import":
      return MASTER_PLAN_INPUT_MARKER;
    case "request":
      return REQUEST_MARKER;
    case undefined:
      return "";
  }
}

function writeWithPrompt(lines: readonly string[]): MentorConsoleEffect {
  return {
    type: "write",
    text: lines.length > 0 ? `${lines.join(CRLF)}${CRLF}${MENTOR_PROMPT}` : MENTOR_PROMPT,
  };
}

function initialDisplay(context: MentorConsoleContext): MentorConsoleEffect {
  return {
    type: "write",
    text: `${renderMentorBanner(context).join(CRLF)}${CRLF}${CRLF}${MENTOR_PROMPT}`,
  };
}

function isSafePrintable(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x20 || codePoint === 0x7f) return false;
  if (codePoint >= 0x80 && codePoint <= 0x9f) return false;
  return !/[\p{Cc}\p{Cf}]/u.test(character);
}

export class MentorConsoleSession {
  private lifecycle: MentorUiSessionState = "IDLE";
  private expectedProjectKey: string | undefined;
  private inputBuffer = "";
  private inputLength = 0;
  private escapeMode: EscapeMode = "normal";
  private suppressNextLineFeed = false;
  private credentialBlockActive = false;

  public constructor(private readonly maxInputLength = DEFAULT_MAX_INPUT_LENGTH) {}

  public get state(): MentorUiSessionState {
    return this.lifecycle;
  }

  public get bufferedInput(): string {
    return this.inputBuffer;
  }

  public open(context: MentorConsoleContext): readonly MentorConsoleEffect[] {
    this.lifecycle = "READY";
    this.expectedProjectKey = context.projectKey;
    this.inputBuffer = "";
    this.inputLength = 0;
    this.escapeMode = "normal";
    this.suppressNextLineFeed = false;
    this.credentialBlockActive = false;
    return [initialDisplay(context)];
  }

  public close(): void {
    this.lifecycle = "CLOSED";
    this.expectedProjectKey = undefined;
    this.inputBuffer = "";
    this.inputLength = 0;
    this.escapeMode = "normal";
    this.suppressNextLineFeed = false;
    this.credentialBlockActive = false;
  }

  public fail(): readonly MentorConsoleEffect[] {
    this.lifecycle = "ERROR";
    this.inputBuffer = "";
    this.inputLength = 0;
    this.escapeMode = "normal";
    this.suppressNextLineFeed = false;
    this.credentialBlockActive = false;
    return [
      {
        type: "write",
        text: [
          "ANN Mentor Console could not refresh the current project context.",
          "This session is closed. Run START ANN again.",
          "No project files or tasks were changed.",
        ].join(CRLF) + CRLF,
      },
      { type: "close" },
    ];
  }

  public handleInput(
    data: string,
    currentContext: MentorConsoleContext | undefined,
  ): readonly MentorConsoleEffect[] {
    if (this.lifecycle !== "READY") return [];

    const effects: MentorConsoleEffect[] = [];
    for (const character of data) {
      if (this.consumeEscapeSequence(character)) continue;

      if (this.suppressNextLineFeed) {
        this.suppressNextLineFeed = false;
        if (character === "\n") continue;
      }

      if (character === "\r" || character === "\n") {
        this.suppressNextLineFeed = character === "\r";
        effects.push(...this.submitCurrentInput(currentContext));
        if (this.lifecycle !== "READY") break;
        continue;
      }

      if (character === "\b" || character === "\u007f") {
        const codePoints = Array.from(this.inputBuffer);
        if (codePoints.length > 0) {
          codePoints.pop();
          this.inputBuffer = codePoints.join("");
          this.inputLength -= 1;
          effects.push({ type: "write", text: "\b \b" });
        }
        continue;
      }

      if (!isSafePrintable(character) || this.inputLength >= this.maxInputLength) {
        continue;
      }

      this.inputBuffer += character;
      this.inputLength += 1;
      effects.push({ type: "write", text: MASKED_INPUT_CHARACTER });
    }
    return effects;
  }

  private submitCurrentInput(
    currentContext: MentorConsoleContext | undefined,
  ): readonly MentorConsoleEffect[] {
    const submitted = this.inputBuffer;
    this.inputBuffer = "";
    this.inputLength = 0;

    const beganCredentialBlock = PRIVATE_KEY_BEGIN.test(submitted);
    const endedCredentialBlock = PRIVATE_KEY_END.test(submitted);
    const sensitiveInput = this.credentialBlockActive
      || beganCredentialBlock
      || containsCredentialLikeText(submitted);
    if (beganCredentialBlock) this.credentialBlockActive = true;
    if (endedCredentialBlock) this.credentialBlockActive = false;

    const intent = submitted.trim() ? resolveMentorIntent(submitted) : undefined;
    const committedInput = sensitiveInput
      ? CREDENTIAL_REDACTION
      : sanitizeTerminalLine(committedInputFor(intent), "", this.maxInputLength);
    const effects: MentorConsoleEffect[] = [{ type: "commit-input", text: committedInput }];

    if (!currentContext || currentContext.projectKey !== this.expectedProjectKey) {
      this.lifecycle = "CLOSED";
      return [...effects,
        {
          type: "write",
          text: [
            "Project context changed.",
            "This ANN Mentor Console session is closed. Run START ANN for the current project.",
            "No project files or tasks were changed.",
          ].join(CRLF) + CRLF,
        },
        { type: "close" },
      ];
    }

    if (!intent) return [...effects, writeWithPrompt([])];

    switch (intent) {
      case "status":
        return [...effects, writeWithPrompt(renderMentorStatus(currentContext))];
      case "project":
        return [...effects, writeWithPrompt(renderMentorProject(currentContext))];
      case "plan":
        return [...effects, writeWithPrompt(renderMentorPlan(currentContext))];
      case "task":
        return [...effects, writeWithPrompt(renderMentorTask(currentContext))];
      case "help":
        return [...effects, writeWithPrompt(renderMentorHelp())];
      case "clear":
        return [...effects, { type: "clear" }, initialDisplay(currentContext)];
      case "exit":
        this.lifecycle = "CLOSED";
        return [...effects,
          {
            type: "write",
            text: `ANN Mentor Console closed.${CRLF}No worker or process was started or stopped.${CRLF}`,
          },
          { type: "close" },
        ];
      case "master-plan-import":
        return [...effects, writeWithPrompt(MASTER_PLAN_IMPORT_RESPONSE)];
      case "request":
        return [...effects, writeWithPrompt(NATURAL_REQUEST_RESPONSE)];
    }
  }

  private consumeEscapeSequence(character: string): boolean {
    const codePoint = character.codePointAt(0) ?? 0;

    if (this.escapeMode !== "normal" && (character === "\r" || character === "\n")) {
      this.escapeMode = "normal";
      return false;
    }

    if (this.escapeMode === "normal") {
      if (character === "\u001b") {
        this.escapeMode = "escape";
        return true;
      }
      if (codePoint === 0x9b) {
        this.escapeMode = "csi";
        return true;
      }
      if (codePoint === 0x8f) {
        this.escapeMode = "ss3";
        return true;
      }
      if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(codePoint)) {
        this.escapeMode = "string";
        return true;
      }
      if (codePoint >= 0x80 && codePoint <= 0x9f) return true;
      return false;
    }

    if (this.escapeMode === "escape") {
      if (character === "[") this.escapeMode = "csi";
      else if (character === "O") this.escapeMode = "ss3";
      else if (["]", "P", "X", "^", "_"].includes(character)) this.escapeMode = "string";
      else if (character !== "\u001b") this.escapeMode = "normal";
      return true;
    }

    if (this.escapeMode === "csi" || this.escapeMode === "ss3") {
      if (character === "\u001b") {
        this.escapeMode = "escape";
      } else if (codePoint >= 0x40 && codePoint <= 0x7e) {
        this.escapeMode = "normal";
      }
      return true;
    }

    if (this.escapeMode === "string") {
      if (codePoint === 0x07 || codePoint === 0x9c) this.escapeMode = "normal";
      else if (character === "\u001b") this.escapeMode = "string-escape";
      return true;
    }

    if (this.escapeMode === "string-escape") {
      if (character === "\\" || codePoint === 0x9c) this.escapeMode = "normal";
      else this.escapeMode = character === "\u001b" ? "string-escape" : "string";
      return true;
    }

    return false;
  }
}
