import { createHash } from "node:crypto";
import path from "node:path";

import { normalizeChatGptUrl, normalizeLocalLabel, type StorageReader } from "./user-settings";

export const LOCAL_WORKSPACE_STORAGE_KEY = "annGuardian.ux05.localWorkspace";
export const LOCAL_WORKSPACE_VERSION = 1 as const;

export type PathFlavor = "win32" | "posix";

export interface LocalGptAccount {
  readonly id: string;
  readonly label: string;
  readonly browserLoginConfirmedAt?: string;
}

export interface LocalAnnProject {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly lastOpenedAt: string;
  readonly gptAccountId?: string;
  readonly chatGptProjectLabel?: string;
  readonly chatGptProjectUrl?: string;
}

export interface LocalWorkspaceState {
  readonly version: typeof LOCAL_WORKSPACE_VERSION;
  readonly currentGptAccountId?: string;
  readonly gptAccounts: readonly LocalGptAccount[];
  readonly projects: readonly LocalAnnProject[];
}

export interface GptAccountInput {
  readonly id?: string;
  readonly label: string;
  readonly browserLoginConfirmedAt?: string;
}

export interface ProjectRegistrationInput {
  readonly projectName: string;
  readonly projectRoot: string;
  readonly gptAccountId?: string;
  readonly chatGptProjectLabel?: string;
  readonly chatGptProjectUrl?: string;
  readonly lastOpenedAt?: string;
}

export interface StateWithAccount {
  readonly state: LocalWorkspaceState;
  readonly account: LocalGptAccount;
}

export interface StateWithProject {
  readonly state: LocalWorkspaceState;
  readonly project: LocalAnnProject;
  readonly added: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nativePathFlavor(): PathFlavor {
  return process.platform === "win32" ? "win32" : "posix";
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9._-]{1,120}$/.test(normalized) ? normalized : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return new Date(value).toISOString() === value ? value : undefined;
  } catch {
    return undefined;
  }
}

function requireTimestamp(value: string): string {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) throw new Error("A canonical ISO-8601 UTC timestamp is required.");
  return timestamp;
}

export function emptyLocalWorkspace(): LocalWorkspaceState {
  return {
    version: LOCAL_WORKSPACE_VERSION,
    gptAccounts: [],
    projects: [],
  };
}

export function normalizeProjectRoot(
  value: unknown,
  flavor: PathFlavor = nativePathFlavor(),
): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return undefined;

  const pathApi = flavor === "win32" ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(candidate)) return undefined;
  return pathApi.normalize(candidate);
}

export function projectRootIdentity(
  projectRoot: unknown,
  flavor: PathFlavor = nativePathFlavor(),
): string | undefined {
  const normalized = normalizeProjectRoot(projectRoot, flavor);
  return flavor === "win32" ? normalized?.toLowerCase() : normalized;
}

export function stableProjectId(
  projectRoot: unknown,
  flavor: PathFlavor = nativePathFlavor(),
): string | undefined {
  const identity = projectRootIdentity(projectRoot, flavor);
  if (!identity) return undefined;
  return `local-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function sanitizeAccount(candidate: unknown): LocalGptAccount | undefined {
  if (!isRecord(candidate)) return undefined;
  const id = normalizeId(candidate.id);
  const label = normalizeLocalLabel(candidate.label);
  const browserLoginConfirmedAt = candidate.browserLoginConfirmedAt === undefined
    ? undefined
    : normalizeTimestamp(candidate.browserLoginConfirmedAt);
  if (!id || !label || (candidate.browserLoginConfirmedAt !== undefined && !browserLoginConfirmedAt)) {
    return undefined;
  }
  return {
    id,
    label,
    ...(browserLoginConfirmedAt ? { browserLoginConfirmedAt } : {}),
  };
}

function sanitizeProject(
  candidate: unknown,
  accounts: ReadonlySet<string>,
  flavor: PathFlavor,
): LocalAnnProject | undefined {
  if (!isRecord(candidate)) return undefined;
  const projectRoot = normalizeProjectRoot(candidate.projectRoot, flavor);
  const projectId = stableProjectId(projectRoot, flavor);
  const projectName = normalizeLocalLabel(candidate.projectName);
  const lastOpenedAt = normalizeTimestamp(candidate.lastOpenedAt);
  if (!projectRoot || !projectId || !projectName || !lastOpenedAt) return undefined;

  const candidateAccountId = normalizeId(candidate.gptAccountId);
  const gptAccountId = candidateAccountId && accounts.has(candidateAccountId)
    ? candidateAccountId
    : undefined;
  const chatGptProjectLabel = normalizeLocalLabel(candidate.chatGptProjectLabel);
  const chatGptProjectUrl = normalizeChatGptUrl(candidate.chatGptProjectUrl);
  const hasValidProjectLink = Boolean(chatGptProjectLabel && chatGptProjectUrl);

  return {
    projectId,
    projectName,
    projectRoot,
    lastOpenedAt,
    ...(gptAccountId ? { gptAccountId } : {}),
    ...(hasValidProjectLink
      ? { chatGptProjectLabel, chatGptProjectUrl }
      : {}),
  };
}

export function sanitizeLocalWorkspace(
  candidate: unknown,
  flavor: PathFlavor = nativePathFlavor(),
): LocalWorkspaceState {
  if (!isRecord(candidate) || candidate.version !== LOCAL_WORKSPACE_VERSION) {
    return emptyLocalWorkspace();
  }

  const accountIds = new Set<string>();
  const gptAccounts: LocalGptAccount[] = [];
  for (const accountCandidate of Array.isArray(candidate.gptAccounts) ? candidate.gptAccounts : []) {
    const account = sanitizeAccount(accountCandidate);
    if (!account || accountIds.has(account.id)) continue;
    accountIds.add(account.id);
    gptAccounts.push(account);
  }

  const projectRoots = new Set<string>();
  const projects: LocalAnnProject[] = [];
  for (const projectCandidate of Array.isArray(candidate.projects) ? candidate.projects : []) {
    const project = sanitizeProject(projectCandidate, accountIds, flavor);
    const identity = project && projectRootIdentity(project.projectRoot, flavor);
    if (!project || !identity || projectRoots.has(identity)) continue;
    projectRoots.add(identity);
    projects.push(project);
  }

  const currentAccountCandidate = normalizeId(candidate.currentGptAccountId);
  const currentGptAccountId = currentAccountCandidate && accountIds.has(currentAccountCandidate)
    ? currentAccountCandidate
    : undefined;

  return {
    version: LOCAL_WORKSPACE_VERSION,
    ...(currentGptAccountId ? { currentGptAccountId } : {}),
    gptAccounts,
    projects,
  };
}

export function readLocalWorkspace(
  storage: StorageReader,
  flavor: PathFlavor = nativePathFlavor(),
): LocalWorkspaceState {
  return sanitizeLocalWorkspace(storage.get<unknown>(LOCAL_WORKSPACE_STORAGE_KEY), flavor);
}

export function workspaceForStorage(
  state: LocalWorkspaceState,
  flavor: PathFlavor = nativePathFlavor(),
): LocalWorkspaceState {
  return sanitizeLocalWorkspace(state, flavor);
}

export function gptAccountById(
  state: LocalWorkspaceState,
  accountId: string | undefined,
): LocalGptAccount | undefined {
  return accountId ? state.gptAccounts.find((account) => account.id === accountId) : undefined;
}

export function currentGptAccount(state: LocalWorkspaceState): LocalGptAccount | undefined {
  return gptAccountById(state, state.currentGptAccountId);
}

export function upsertGptAccount(
  state: LocalWorkspaceState,
  input: GptAccountInput,
  createId: () => string,
): StateWithAccount {
  const label = normalizeLocalLabel(input.label);
  const requestedId = input.id === undefined ? undefined : normalizeId(input.id);
  const id = requestedId ?? normalizeId(`gpt-${createId()}`);
  const confirmation = input.browserLoginConfirmedAt === undefined
    ? undefined
    : normalizeTimestamp(input.browserLoginConfirmedAt);
  if (!label || !id || (input.browserLoginConfirmedAt !== undefined && !confirmation)) {
    throw new Error("GPT account metadata is invalid.");
  }

  const existing = gptAccountById(state, id);
  const account: LocalGptAccount = {
    id,
    label,
    ...(confirmation
      ? { browserLoginConfirmedAt: confirmation }
      : existing?.browserLoginConfirmedAt
        ? { browserLoginConfirmedAt: existing.browserLoginConfirmedAt }
        : {}),
  };
  const gptAccounts = existing
    ? state.gptAccounts.map((candidate) => candidate.id === id ? account : candidate)
    : [...state.gptAccounts, account];

  return {
    account,
    state: {
      ...state,
      currentGptAccountId: id,
      gptAccounts,
    },
  };
}

export function selectCurrentGptAccount(
  state: LocalWorkspaceState,
  accountId: string | undefined,
): LocalWorkspaceState {
  if (accountId === undefined) {
    const { currentGptAccountId: _discarded, ...withoutCurrent } = state;
    return withoutCurrent;
  }
  if (!gptAccountById(state, accountId)) throw new Error("GPT account does not exist.");
  return { ...state, currentGptAccountId: accountId };
}

export function projectById(
  state: LocalWorkspaceState,
  projectId: string | undefined,
): LocalAnnProject | undefined {
  return projectId ? state.projects.find((project) => project.projectId === projectId) : undefined;
}

export function projectByRoot(
  state: LocalWorkspaceState,
  projectRoot: string | undefined,
  flavor: PathFlavor = nativePathFlavor(),
): LocalAnnProject | undefined {
  const identity = projectRootIdentity(projectRoot, flavor);
  return identity
    ? state.projects.find((project) => projectRootIdentity(project.projectRoot, flavor) === identity)
    : undefined;
}

export function addOrUpdateProject(
  state: LocalWorkspaceState,
  input: ProjectRegistrationInput,
  now: string,
  flavor: PathFlavor = nativePathFlavor(),
): StateWithProject {
  const projectRoot = normalizeProjectRoot(input.projectRoot, flavor);
  const projectId = stableProjectId(projectRoot, flavor);
  const projectName = normalizeLocalLabel(input.projectName);
  if (!projectRoot || !projectId || !projectName) throw new Error("Project registration metadata is invalid.");

  const existing = projectById(state, projectId);
  const account = gptAccountById(state, input.gptAccountId);
  const chatGptProjectLabel = normalizeLocalLabel(input.chatGptProjectLabel);
  const chatGptProjectUrl = normalizeChatGptUrl(input.chatGptProjectUrl);
  if (Boolean(input.chatGptProjectLabel) !== Boolean(input.chatGptProjectUrl)) {
    throw new Error("ChatGPT Project label and URL must be configured together.");
  }
  if (input.gptAccountId && !account) throw new Error("Mapped GPT account does not exist.");
  if (input.chatGptProjectLabel && (!chatGptProjectLabel || !chatGptProjectUrl)) {
    throw new Error("ChatGPT Project metadata is invalid.");
  }

  const project: LocalAnnProject = {
    projectId,
    projectName,
    projectRoot,
    lastOpenedAt: input.lastOpenedAt
      ? requireTimestamp(input.lastOpenedAt)
      : existing?.lastOpenedAt ?? requireTimestamp(now),
    ...(account ? { gptAccountId: account.id } : existing?.gptAccountId ? { gptAccountId: existing.gptAccountId } : {}),
    ...(chatGptProjectLabel && chatGptProjectUrl
      ? { chatGptProjectLabel, chatGptProjectUrl }
      : existing?.chatGptProjectLabel && existing.chatGptProjectUrl
        ? {
            chatGptProjectLabel: existing.chatGptProjectLabel,
            chatGptProjectUrl: existing.chatGptProjectUrl,
          }
        : {}),
  };

  return {
    project,
    added: !existing,
    state: {
      ...state,
      projects: existing
        ? state.projects.map((candidate) => candidate.projectId === projectId ? project : candidate)
        : [...state.projects, project],
    },
  };
}

export function markProjectOpened(
  state: LocalWorkspaceState,
  projectId: string,
  openedAt: string,
): LocalWorkspaceState {
  const timestamp = requireTimestamp(openedAt);
  if (!projectById(state, projectId)) throw new Error("Project does not exist.");
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.projectId === projectId ? { ...project, lastOpenedAt: timestamp } : project
    ),
  };
}

export function removeProject(
  state: LocalWorkspaceState,
  projectId: string,
): LocalWorkspaceState {
  return {
    ...state,
    projects: state.projects.filter((project) => project.projectId !== projectId),
  };
}

export function mapProjectToGptAccount(
  state: LocalWorkspaceState,
  projectId: string,
  accountId: string | undefined,
): LocalWorkspaceState {
  if (!projectById(state, projectId)) throw new Error("Project does not exist.");
  if (accountId && !gptAccountById(state, accountId)) throw new Error("GPT account does not exist.");
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.projectId !== projectId) return project;
      const { gptAccountId: _discarded, ...withoutMapping } = project;
      return accountId ? { ...withoutMapping, gptAccountId: accountId } : withoutMapping;
    }),
  };
}

export function setProjectChatGptLink(
  state: LocalWorkspaceState,
  projectId: string,
  projectLabel: string | undefined,
  projectUrl: string | undefined,
): LocalWorkspaceState {
  if (!projectById(state, projectId)) throw new Error("Project does not exist.");
  const label = projectLabel === undefined ? undefined : normalizeLocalLabel(projectLabel);
  const url = projectUrl === undefined ? undefined : normalizeChatGptUrl(projectUrl);
  if (Boolean(projectLabel) !== Boolean(projectUrl) || (projectLabel && (!label || !url))) {
    throw new Error("ChatGPT Project metadata is invalid.");
  }

  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.projectId !== projectId) return project;
      const {
        chatGptProjectLabel: _discardedLabel,
        chatGptProjectUrl: _discardedUrl,
        ...withoutLink
      } = project;
      return label && url
        ? { ...withoutLink, chatGptProjectLabel: label, chatGptProjectUrl: url }
        : withoutLink;
    }),
  };
}
