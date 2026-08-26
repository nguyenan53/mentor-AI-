import { createHash } from "node:crypto";
import path from "node:path";

export const USER_PROFILE_STORAGE_KEY = "annGuardian.userProfile";
const MENTOR_LINK_STORAGE_PREFIX = "annGuardian.chatGptMentor";
const MAX_LABEL_LENGTH = 120;

export interface StorageReader {
  get<T>(key: string): T | undefined;
}

export interface LocalUserProfile {
  readonly displayName?: string;
}

export interface ChatGptMentorLink {
  readonly accountLabel: string;
  readonly projectLabel: string;
  readonly url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeLocalLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, MAX_LABEL_LENGTH) : undefined;
}

export function normalizeChatGptUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    const isChatGptHost = hostname === "chatgpt.com"
      || hostname.endsWith(".chatgpt.com")
      || hostname === "chat.openai.com";
    if (parsed.protocol !== "https:" || !isChatGptHost || parsed.username || parsed.password) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function mentorLinkStorageKey(projectRoot: string): string {
  const resolvedRoot = path.resolve(projectRoot);
  const stableRoot = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  const projectKey = createHash("sha256").update(stableRoot).digest("hex").slice(0, 24);
  return `${MENTOR_LINK_STORAGE_PREFIX}.${projectKey}`;
}

export function readLocalUserProfile(storage: StorageReader): LocalUserProfile {
  const candidate = storage.get<unknown>(USER_PROFILE_STORAGE_KEY);
  if (!isRecord(candidate)) {
    return {};
  }

  const displayName = normalizeLocalLabel(candidate.displayName);
  return displayName ? { displayName } : {};
}

export function readChatGptMentorLink(
  storage: StorageReader,
  projectRoot: string,
): ChatGptMentorLink | undefined {
  const candidate = storage.get<unknown>(mentorLinkStorageKey(projectRoot));
  if (!isRecord(candidate)) {
    return undefined;
  }

  const accountLabel = normalizeLocalLabel(candidate.accountLabel);
  const projectLabel = normalizeLocalLabel(candidate.projectLabel);
  const url = normalizeChatGptUrl(candidate.url);
  if (!accountLabel || !projectLabel || !url) {
    return undefined;
  }

  return { accountLabel, projectLabel, url };
}
