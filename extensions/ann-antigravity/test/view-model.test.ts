import assert from "node:assert/strict";
import test from "node:test";

import { ControlRoomSnapshot, formatTaskStatus, nextActionFor } from "../src/view-model";

const readyTerminal = {
  shellLabel: "PowerShell",
  status: "ready" as const,
  description: "Ready. No command has been executed.",
};

function completeSnapshot(overrides: Partial<ControlRoomSnapshot> = {}): ControlRoomSnapshot {
  return {
    projectRoot: "C:/Projects/mentor-AI-",
    profile: { displayName: "Bao" },
    mentorLink: {
      accountLabel: "Personal Plus",
      projectLabel: "ANN Mentor",
      url: "https://chatgpt.com/c/example",
    },
    terminal: readyTerminal,
    state: {
      status: "valid",
      statePath: "C:/Projects/mentor-AI-/.ann/PROJECT_STATE.json",
      projectName: "mentor-ai-ann",
      milestone: "M1",
      task: "M1.3",
      taskStatus: "COMPLETE",
      verification: "PASSED",
    },
    ...overrides,
  };
}

test("turns a completed current task into a Core-owned next action", () => {
  assert.deepEqual(nextActionFor(completeSnapshot()), {
    label: "Select the next Core unit from the Master Plan.",
  });
  assert.equal(formatTaskStatus("READY_TO_IMPLEMENT"), "Ready To Implement");
});

test("prioritizes actionable UX0 empty states", () => {
  assert.equal(nextActionFor({ profile: {}, terminal: readyTerminal }).command, "workbench.action.files.openFolder");
  assert.equal(
    nextActionFor(completeSnapshot({ profile: {} })).command,
    "annGuardian.configureUserProfile",
  );
  assert.equal(
    nextActionFor(completeSnapshot({ mentorLink: undefined })).command,
    "annGuardian.configureChatGptMentor",
  );
});

test("never advances blocked state and never invents the next Core unit", () => {
  const blocked = completeSnapshot({
    state: { ...completeSnapshot().state!, taskStatus: "BLOCKED" },
  });
  const action = nextActionFor(blocked);

  assert.match(action.label, /Resolve the recorded ANN Core blocker/);
  assert.doesNotMatch(action.label, /M1\.4/);
  assert.equal(action.command, undefined);
});
