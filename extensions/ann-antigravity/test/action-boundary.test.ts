import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("identity and project actions have no project/governance filesystem writer", async () => {
  const commandsSource = await readFile(path.resolve(__dirname, "../../src/commands.ts"), "utf8");

  assert.doesNotMatch(commandsSource, /from ["']node:fs/);
  assert.doesNotMatch(commandsSource, /\b(?:writeFile|appendFile|mkdir|rename|unlink|rm)\s*\(/);
  assert.match(commandsSource, /globalState\.update/);
});

test("extension activation never opens a browser or executes a terminal task", async () => {
  const activationSource = await readFile(path.resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.doesNotMatch(activationSource, /openExternal|ProcessExecution|executeTask/);
});
