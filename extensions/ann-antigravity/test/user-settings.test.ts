import assert from "node:assert/strict";
import test from "node:test";

import {
  USER_PROFILE_STORAGE_KEY,
  mentorLinkStorageKey,
  normalizeChatGptUrl,
  readChatGptMentorLink,
  readLocalUserProfile,
} from "../src/user-settings";

class MemoryStorage {
  public constructor(private readonly values: ReadonlyMap<string, unknown>) {}

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }
}

test("reads sanitized user metadata from extension-local storage", () => {
  const storage = new MemoryStorage(new Map([
    [USER_PROFILE_STORAGE_KEY, { displayName: "  Bao\u0000 Nguyen  " }],
  ]));

  assert.deepEqual(readLocalUserProfile(storage), { displayName: "Bao  Nguyen" });
});

test("keeps ChatGPT Mentor links project-scoped and explicitly local", () => {
  const firstRoot = "C:/Projects/mentor-AI-";
  const secondRoot = "C:/Projects/another-ann";
  const storage = new MemoryStorage(new Map([
    [mentorLinkStorageKey(firstRoot), {
      accountLabel: "Personal Plus",
      projectLabel: "ANN Mentor",
      url: "https://chatgpt.com/g/g-p-example/project",
    }],
  ]));

  assert.deepEqual(readChatGptMentorLink(storage, firstRoot), {
    accountLabel: "Personal Plus",
    projectLabel: "ANN Mentor",
    url: "https://chatgpt.com/g/g-p-example/project",
  });
  assert.equal(readChatGptMentorLink(storage, secondRoot), undefined);
  assert.notEqual(mentorLinkStorageKey(firstRoot), mentorLinkStorageKey(secondRoot));
});

test("accepts only credential-free HTTPS ChatGPT URLs", () => {
  assert.equal(normalizeChatGptUrl("https://chatgpt.com/c/example"), "https://chatgpt.com/c/example");
  assert.equal(normalizeChatGptUrl("http://chatgpt.com/c/example"), undefined);
  assert.equal(normalizeChatGptUrl("https://example.com/chatgpt"), undefined);
  assert.equal(normalizeChatGptUrl("https://user:secret@chatgpt.com/c/example"), undefined);
});
