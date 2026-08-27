import assert from "node:assert/strict";
import test from "node:test";

import {
  USER_PROFILE_STORAGE_KEY,
  mentorLinkStorageKey,
  normalizeChatGptUrl,
  normalizeLocalLabel,
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
  assert.equal(normalizeChatGptUrl("https://chatgpt.com/c/example?token=secret"), undefined);
  assert.equal(normalizeChatGptUrl("https://chatgpt.com/c/example#private"), undefined);
});

test("rejects credential-shaped values from local display labels", () => {
  const openAiTokenFixture = ["sk", "proj", "0123456789abcdef0123456789"].join("-");
  const googleTokenFixture = ["AIza", "SyDUMMYSECRET1234567890"].join("");
  const slackTokenFixture = ["xoxb", "123456789012", "abcdefghijklmnop"].join("-");
  const gitLabTokenFixture = ["glpat", "abcdefghijklmnopqrst"].join("-");
  const npmTokenFixture = ["npm", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");

  assert.equal(normalizeLocalLabel("Personal Plus"), "Personal Plus");
  assert.equal(normalizeLocalLabel(openAiTokenFixture), undefined);
  assert.equal(normalizeLocalLabel("eyJhbGciOiJIUzI1NiJ9.payload123456.signature123456"), undefined);
  assert.equal(normalizeLocalLabel("user@example.com:password123"), undefined);
  assert.equal(normalizeLocalLabel(googleTokenFixture), undefined);
  assert.equal(normalizeLocalLabel(slackTokenFixture), undefined);
  assert.equal(normalizeLocalLabel(gitLabTokenFixture), undefined);
  assert.equal(normalizeLocalLabel(npmTokenFixture), undefined);
  assert.equal(normalizeLocalLabel("token=qwerty12345"), undefined);
  assert.equal(normalizeLocalLabel("token\u200d=qwerty12345"), undefined);
});
