import assert from "node:assert/strict";
import test from "node:test";

import type { MentorConsoleContext } from "../src/mentor-console-model";
import {
  MentorSessionManager,
  type MentorSessionPort,
} from "../src/mentor-session-manager";
import { readyContext } from "./mentor-console-fixture";

interface FakePort extends MentorSessionPort {
  revealCount: number;
  disposeCount: number;
  closeFromUi(): void;
}

function managerFixture(): {
  readonly manager: MentorSessionManager;
  readonly ports: FakePort[];
} {
  const ports: FakePort[] = [];
  const manager = new MentorSessionManager((_context, onClosed) => {
    const port: FakePort = {
      revealCount: 0,
      disposeCount: 0,
      reveal() {
        this.revealCount += 1;
      },
      dispose() {
        this.disposeCount += 1;
        onClosed();
      },
      closeFromUi() {
        onClosed();
      },
    };
    ports.push(port);
    return port;
  });
  return { manager, ports };
}

test("START is unavailable when no current registered project context exists", () => {
  const { manager, ports } = managerFixture();

  assert.deepEqual(manager.start(undefined), { status: "unavailable" });
  assert.equal(manager.state, "IDLE");
  assert.equal(ports.length, 0);
});

test("START opens one session and repeated START reveals the same session", () => {
  const { manager, ports } = managerFixture();
  const context = readyContext();

  assert.deepEqual(manager.start(context), { status: "opened" });
  assert.deepEqual(manager.start(context), { status: "reused" });
  assert.equal(ports.length, 1);
  assert.equal(ports[0]?.revealCount, 2);
  assert.equal(ports[0]?.disposeCount, 0);
  assert.equal(manager.state, "READY");
});

test("switching project closes stale identity and requires a fresh session", () => {
  const { manager, ports } = managerFixture();
  const first = readyContext();
  const second: MentorConsoleContext = {
    ...first,
    projectKey: "local-project-b:/ann/project-b",
    projectId: "local-project-b",
    projectName: "Project B",
    projectRoot: "/ann/project-b",
  };

  manager.start(first);
  assert.equal(manager.synchronize(second), "closed-stale");
  assert.equal(ports[0]?.disposeCount, 1);
  assert.equal(manager.activeProjectKey, undefined);

  assert.deepEqual(manager.start(second), { status: "opened" });
  assert.equal(ports.length, 2);
  assert.equal(manager.activeProjectKey, second.projectKey);
});

test("START with a different project replaces rather than duplicates the session", () => {
  const { manager, ports } = managerFixture();
  const first = readyContext();
  const second: MentorConsoleContext = { ...first, projectKey: "project-b", projectName: "Project B" };

  manager.start(first);
  assert.deepEqual(manager.start(second), { status: "replaced" });
  assert.equal(ports.length, 2);
  assert.equal(ports[0]?.disposeCount, 1);
  assert.equal(ports[1]?.revealCount, 1);
});

test("manual terminal close clears the manager so START can create a new session", () => {
  const { manager, ports } = managerFixture();
  const context = readyContext();

  manager.start(context);
  ports[0]?.closeFromUi();
  assert.equal(manager.activeProjectKey, undefined);
  assert.equal(manager.state, "CLOSED");

  assert.deepEqual(manager.start(context), { status: "opened" });
  assert.equal(ports.length, 2);
});

test("disposing the manager closes only its UI port", () => {
  const { manager, ports } = managerFixture();
  manager.start(readyContext());

  manager.dispose();
  assert.equal(manager.state, "CLOSED");
  assert.equal(ports[0]?.disposeCount, 1);
  assert.equal(manager.activeProjectKey, undefined);
});

test("a failed reveal disposes and detaches the terminal port", () => {
  let disposeCount = 0;
  const manager = new MentorSessionManager(() => ({
    reveal() {
      throw new Error("terminal reveal failed");
    },
    dispose() {
      disposeCount += 1;
    },
  }));

  assert.deepEqual(manager.start(readyContext()), { status: "error" });
  assert.equal(disposeCount, 1);
  assert.equal(manager.state, "ERROR");
  assert.equal(manager.activeProjectKey, undefined);
});
