import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const mentorModules = [
  "mentor-console-model.ts",
  "mentor-console-session.ts",
  "mentor-session-manager.ts",
  "mentor-pseudoterminal.ts",
];

async function mentorSource(): Promise<string> {
  return (await Promise.all(mentorModules.map((file) =>
    readFile(path.resolve(__dirname, "../../src", file), "utf8")
  ))).join("\n");
}

test("Mentor Console contains no project writer, persisted transcript, process, network, or model bridge", async () => {
  const source = await mentorSource();

  for (const forbidden of [
    /from ["']node:fs/,
    /from ["']node:child_process/,
    /from ["']node:(?:http|https|net|tls|dns)/,
    /\b(?:writeFile|appendFile|mkdir|rename|unlink|rm)\s*\(/,
    /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/,
    /\b(?:ProcessExecution|ShellExecution|executeTask|sendText|shellPath)\b/,
    /\bopenExternal\b/,
    /\bglobalState\b/,
    /\bworkspaceState\b/,
    /\bsecrets\b/,
    /\btelemetry\b/i,
    /\bconsole\.(?:log|info|warn|error)\b/,
    /Antigravity.*(?:execute|chat|command|textbox|DOM)/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("Mentor terminal is a transient Pseudoterminal rather than a user shell", async () => {
  const source = await readFile(
    path.resolve(__dirname, "../../src/mentor-pseudoterminal.ts"),
    "utf8",
  );

  assert.match(source, /implements vscode\.Pseudoterminal/);
  assert.match(source, /createTerminal\(\{[\s\S]*?pty,/);
  assert.match(source, /isTransient:\s*true/);
  assert.doesNotMatch(source, /shellPath|shellArgs|sendText|createTerminal\([^\{]/);
  assert.match(source, /catch \{\s*this\.apply\(this\.session\.fail\(\)\);\s*return;/);
  assert.doesNotMatch(source, /safe read-only fallback/);
});

test("START ANN integration does not mutate registry, project, or terminal processes", async () => {
  const commands = (await readFile(path.resolve(__dirname, "../../src/commands.ts"), "utf8"))
    .replaceAll("\r\n", "\n");
  const startFunction = /async function startAnn[\s\S]*?\n}\n\nexport function registerCommands/.exec(commands)?.[0];

  assert.ok(startFunction, "Expected the dedicated START ANN function.");
  assert.match(startFunction, /context\.refresh\(\)/);
  assert.match(startFunction, /context\.startAnn\(\)/);
  assert.doesNotMatch(startFunction, /globalState|markProjectOpened|saveLocalWorkspace|openExternal/);
  assert.doesNotMatch(startFunction, /ProcessExecution|ShellExecution|executeTask|sendText/);
});

test("extension activation owns but never starts the Mentor Console automatically", async () => {
  const source = (await readFile(path.resolve(__dirname, "../../src/extension.ts"), "utf8"))
    .replaceAll("\r\n", "\n");
  const constructor = /public constructor[\s\S]*?\n  }\n\n  public async refresh/.exec(source)?.[0];

  assert.ok(constructor, "Expected the control-room constructor.");
  assert.match(source, /new MentorConsoleController/);
  assert.match(source, /startAnn:\s*\(\)\s*=>\s*this\.mentorConsole\.start\(\)/);
  const withoutRegisteredCallback = constructor.replace(
    /startAnn:\s*\(\)\s*=>\s*this\.mentorConsole\.start\(\),/,
    "",
  );
  assert.doesNotMatch(withoutRegisteredCallback, /this\.mentorConsole\.start\(\)/);
});
