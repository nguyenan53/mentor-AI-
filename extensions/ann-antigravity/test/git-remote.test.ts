import assert from "node:assert/strict";
import test from "node:test";

import { parseGitRemote } from "../src/git-remote";

test("parses HTTPS and SSH GitHub remotes without exposing transport details", () => {
  const expected = { providerLabel: "GitHub", repositoryLabel: "nguyenan53/mentor-AI-" };

  assert.deepEqual(parseGitRemote("https://github.com/nguyenan53/mentor-AI-.git"), expected);
  assert.deepEqual(parseGitRemote("git@github.com:nguyenan53/mentor-AI-.git"), expected);
  assert.deepEqual(parseGitRemote("ssh://git@github.com/nguyenan53/mentor-AI-.git"), expected);
});

test("uses a host-qualified label for non-GitHub remotes", () => {
  assert.deepEqual(parseGitRemote("https://gitlab.example.com/team/ann.git"), {
    providerLabel: "Repository",
    repositoryLabel: "gitlab.example.com/team/ann",
  });
  assert.equal(parseGitRemote("not a remote URL"), undefined);
});
