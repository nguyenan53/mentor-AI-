import { createHash } from "node:crypto";
import path from "node:path";

export const USER_PROFILE_STORAGE_KEY = "annGuardian.userProfile";
const MENTOR_LINK_STORAGE_PREFIX = "annGuardian.chatGptMentor";
const MAX_LABEL_LENGTH = 120;
const CREDENTIAL_VALUE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9_-]{10,}\b/i,
  /\bglpat-[A-Za-z0-9_-]{10,}\b/i,
  /\bnpm_[A-Za-z0-9]{20,}\b/,
  /\bya29\.[A-Za-z0-9_-]{20,}\b/,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b[^\s:@]+@[^\s:@]+:[^\s]+\b/,
  /\b(?:token|password|passwd|api[_-]?key|access[_-]?token|session[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i,
];

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

export function containsCredentialLikeText(value: unknown): boolean {
  return typeof value === "string" && CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function normalizeLocalLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .trim();
  if (!normalized || containsCredentialLikeText(normalized)) {
    return undefined;
  }
  return normalized.slice(0, MAX_LABEL_LENGTH);
}

export function normalizeChatGptUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    const isChatGptHost = hostname === "chatgpt.com"
      || hostname === "www.chatgpt.com"
      || hostname === "chat.openai.com";
    if (
      parsed.protocol !== "https:"
      || !isChatGptHost
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
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
