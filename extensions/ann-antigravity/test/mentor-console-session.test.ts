import assert from "node:assert/strict";
import test from "node:test";

import type { MentorConsoleContext } from "../src/mentor-console-model";
import {
  MentorConsoleSession,
  resolveMentorIntent,
  type MentorConsoleEffect,
} from "../src/mentor-console-session";
import { readyContext } from "./mentor-console-fixture";

function effectText(effects: readonly MentorConsoleEffect[]): string {
  return effects
    .filter((effect): effect is Extract<MentorConsoleEffect, { type: "write" }> => effect.type === "write")
    .map((effect) => effect.text)
    .join("");
}

function transcriptText(effects: readonly MentorConsoleEffect[]): string {
  return effects
    .filter((effect): effect is Extract<MentorConsoleEffect, { type: "write" | "commit-input" }> =>
      effect.type === "write" || effect.type === "commit-input"
    )
    .map((effect) => effect.text)
    .join("");
}

function openedSession(context = readyContext()): MentorConsoleSession {
  const session = new MentorConsoleSession();
  session.open(context);
  return session;
}

function submit(
  session: MentorConsoleSession,
  value: string,
  context: MentorConsoleContext = readyContext(),
): readonly MentorConsoleEffect[] {
  return session.handleInput(`${value}\r\n`, context);
}

test("/status reads the fresh supplied snapshot instead of stale start context", () => {
  const initial = readyContext();
  const fresh = { ...initial, branch: "fresh-read-only-branch", taskStatus: "VERIFYING" };
  const session = openedSession(initial);
  const output = effectText(submit(session, "/status", fresh));

  assert.match(output, /Branch: fresh-read-only-branch/);
  assert.match(output, /Task: M1\.3 — VERIFYING/);
});

test("/project shows the registered project, root, and mappings", () => {
  const output = effectText(submit(openedSession(), "/project"));

  assert.match(output, /Project: Project A/);
  assert.match(output, /Registration: REGISTERED IN MY PROJECTS/);
  assert.match(output, /GPT context: Bao - ChatGPT Business/);
});

test("/plan reports READY and MISSING without enabling intake", () => {
  const ready = readyContext();
  assert.match(effectText(submit(openedSession(ready), "/plan", ready)), /Master Plan: READY/);

  const missing: MentorConsoleContext = { ...ready, masterPlanStatus: "MISSING" };
  const output = effectText(submit(openedSession(missing), "/plan", missing));
  assert.match(output, /Master Plan: MISSING/);
  assert.match(output, /Next capability: Master Plan Intake/);
  assert.match(output, /No authority files were changed/);
});

test("/task shows existing and missing Core state read-only", () => {
  const existing = readyContext();
  assert.match(effectText(submit(openedSession(existing), "/task", existing)), /Task: M1\.3/);

  const missing: MentorConsoleContext = {
    ...existing,
    projectState: "Not initialized",
    milestone: "Not available yet",
    task: "None",
    taskStatus: "Waiting for Core",
  };
  const output = effectText(submit(openedSession(missing), "/task", missing));
  assert.match(output, /PROJECT_STATE: Not initialized/);
  assert.match(output, /Task: None/);
  assert.match(output, /Waiting for Core/);
});

test("/help documents exactly the safe UX1 surface", () => {
  const output = effectText(submit(openedSession(), "/help"));

  for (const command of ["/status", "/project", "/plan", "/task", "/help", "/clear", "/exit"]) {
    assert.match(output, new RegExp(command.replace("/", "\\/")));
  }
  assert.match(output, /reasoning\/execution is not connected in UX1 yet/i);
  assert.doesNotMatch(output, /\/run|\/auto|\/worker/);
});

test("/clear only emits a UI clear effect and redraws the ANN banner", () => {
  const effects = submit(openedSession(), "/clear");

  assert.equal(effects.filter((effect) => effect.type === "clear").length, 1);
  assert.equal(effects.some((effect) => effect.type === "close"), false);
  assert.match(effectText(effects), /ANN Mentor/);
});

test("/exit closes only the in-memory UI session", () => {
  const session = openedSession();
  const effects = submit(session, "/exit");

  assert.equal(session.state, "CLOSED");
  assert.equal(effects.filter((effect) => effect.type === "close").length, 1);
  assert.match(effectText(effects), /No worker or process was started or stopped/);
});

test("input buffering supports Unicode Backspace and DEL", () => {
  const context = readyContext();
  const session = openedSession(context);

  session.handleInput("A🙂\bB\u007fC", context);
  assert.equal(session.bufferedInput, "AC");
  assert.equal(effectText(session.handleInput("\r", context)).match(/Request received\./g)?.length, 1);
});

test("input buffering rejects Unicode control and format characters", () => {
  const context = readyContext();
  const session = openedSession(context);

  session.handleInput("A\u061cB\u200dC", context);
  assert.equal(session.bufferedInput, "ABC");
});

test("Enter handles CR, LF, CRLF, and split CRLF exactly once", () => {
  const context = readyContext();
  const session = openedSession(context);
  const first = effectText(session.handleInput("hello\r", context));
  const suppressed = effectText(session.handleInput("\n", context));
  const second = effectText(session.handleInput("again\n", context));

  assert.equal(first.match(/Request received\./g)?.length, 1);
  assert.equal(suppressed, "");
  assert.equal(second.match(/Request received\./g)?.length, 1);
});

test("terminal control sequences are consumed across chunks and never enter the buffer", () => {
  const context = readyContext();
  const session = openedSession(context);

  session.handleInput("\u001b]0;private", context);
  session.handleInput(" title", context);
  session.handleInput("\u0007he", context);
  session.handleInput("lp\u001b[31", context);
  session.handleInput("m", context);
  assert.equal(session.bufferedInput, "help");

  const output = effectText(session.handleInput("\r", context));
  assert.match(output, /Supported commands/);
  assert.doesNotMatch(output, /private title|\u001b/u);
});

test("an unterminated terminal string sequence resets at Enter instead of locking input", () => {
  const context = readyContext();
  const session = openedSession(context);

  session.handleInput("\u001b]0;unterminated", context);
  const recovered = session.handleInput("\r", context);
  assert.equal(session.state, "READY");
  assert.equal(session.bufferedInput, "");
  assert.match(effectText(recovered), /ANN > /);

  const helpEffects = submit(session, "/help", context);
  const output = effectText(helpEffects);
  assert.match(output, /Supported commands/);
  assert.doesNotMatch(transcriptText([...recovered, ...helpEffects]), /unterminated/);
});

test("aliases are exact deterministic Vietnamese and English matches", () => {
  assert.equal(resolveMentorIntent("tình trạng hiện tại"), "status");
  assert.equal(resolveMentorIntent("đang tới đâu"), "status");
  assert.equal(resolveMentorIntent("project hiện tại"), "project");
  assert.equal(resolveMentorIntent("kế hoạch tổng thể"), "plan");
  assert.equal(resolveMentorIntent("task hiện tại"), "task");
  assert.equal(resolveMentorIntent("trợ giúp"), "help");
  assert.equal(resolveMentorIntent("/status; npm test"), "request");
  assert.equal(resolveMentorIntent("please show task and run it"), "request");
});

test("arbitrary natural-language requests return the exact non-execution boundary", () => {
  const request = "thêm chức năng login Google";
  const effects = submit(openedSession(), request);
  const output = effectText(effects);

  assert.match(output, /Request received\.\r\nMentor reasoning\/execution is not connected in UX1 yet\.\r\nNo project files or tasks were changed\./);
  assert.equal(effects.some((effect) => effect.type === "commit-input" && effect.text === "[request received]"), true);
  assert.doesNotMatch(JSON.stringify(effects), new RegExp(request));
  assert.doesNotMatch(output, /completed|executed successfully|worker started/i);
});

test("unknown token formats are never replayed into the terminal transcript", () => {
  const context = readyContext();
  for (const token of [
    ["AIza", "SyA1234567890abcdefghijklmnop"].join(""),
    ["xoxb", "123456789012", "123456789012", "abcdefghijklmnop"].join("-"),
    ["glpat", "abcdefghijklmnopqrst"].join("-"),
    ["npm", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_"),
  ]) {
    const effects = submit(openedSession(context), token, context);
    assert.doesNotMatch(JSON.stringify(effects), new RegExp(token));
    assert.match(transcriptText(effects), /\[(?:request received|credential-like input redacted)\]/);
  }
});

test("input is masked while editing and credential-like submissions never enter effects", () => {
  const context = readyContext();
  const session = openedSession(context);
  const token = ["sk", "proj", "0123456789abcdef0123456789"].join("-");

  const editing = session.handleInput(token, context);
  assert.doesNotMatch(JSON.stringify(editing), new RegExp(token));
  assert.equal(effectText(editing), "•".repeat(Array.from(token).length));

  const submitted = session.handleInput("\r", context);
  assert.doesNotMatch(JSON.stringify(submitted), new RegExp(token));
  assert.match(transcriptText(submitted), /credential-like input redacted/);
});

test("every line of a pasted private-key block is masked and redacted", () => {
  const context = readyContext();
  const session = openedSession(context);
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "MIIBverysecretbody",
    "-----END PRIVATE KEY-----",
  ].join("\r\n");

  const effects = session.handleInput(`${privateKey}\r\n`, context);
  const serialized = JSON.stringify(effects);
  assert.doesNotMatch(serialized, /BEGIN PRIVATE KEY|MIIBverysecretbody|END PRIVATE KEY/);
  assert.equal(transcriptText(effects).match(/credential-like input redacted/g)?.length, 3);
});

test("large paste is bounded without quadratic buffer counting or raw echo", () => {
  const context = readyContext();
  const session = new MentorConsoleSession(4096);
  session.open(context);

  const effects = session.handleInput("x".repeat(100_000), context);
  assert.equal(Array.from(session.bufferedInput).length, 4096);
  assert.equal(effects.length, 4096);
  assert.doesNotMatch(JSON.stringify(effects), /xxx/);
});

test("Master Plan-looking input is rejected without authority writes", () => {
  const output = effectText(submit(openedSession(), "hãy ghi master plan vào .ann/MASTER_PLAN.md"));

  assert.match(output, /Master Plan import is not enabled in this unit/);
  assert.match(output, /No authority files were changed/);
});

test("stale project identity closes before answering a command", () => {
  const initial = readyContext();
  const stale: MentorConsoleContext = { ...initial, projectKey: "other-project", projectName: "Project B" };
  const session = openedSession(initial);
  const effects = submit(session, "/status", stale);

  assert.equal(session.state, "CLOSED");
  assert.equal(effects.some((effect) => effect.type === "close"), true);
  assert.match(effectText(effects), /Project context changed/);
  assert.doesNotMatch(effectText(effects), /Project: Project B/);
});

test("refresh failure transitions the UI session to ERROR and requests a fresh START", () => {
  const session = openedSession();
  const effects = session.fail();

  assert.equal(session.state, "ERROR");
  assert.equal(effects.some((effect) => effect.type === "close"), true);
  assert.match(effectText(effects), /Run START ANN again/);
});
