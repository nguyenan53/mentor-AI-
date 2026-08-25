import assert from "node:assert/strict";
import test from "node:test";

import { describeTerminalReadiness } from "../src/terminal-readiness";

test("describes shell and root readiness without executing anything", () => {
  assert.deepEqual(describeTerminalReadiness("C:/Projects/mentor-AI-", "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"), {
    shellLabel: "PowerShell",
    status: "ready",
    description: "Ready at C:/Projects/mentor-AI-. No command has been executed.",
  });
});

test("makes missing project and shell states actionable", () => {
  assert.equal(describeTerminalReadiness(undefined, "pwsh.exe").status, "unavailable");
  assert.match(describeTerminalReadiness("C:/repo", undefined).description, /Select a default terminal profile/);
});
