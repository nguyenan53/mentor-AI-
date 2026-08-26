import * as vscode from "vscode";

import { parseGitRemote } from "./git-remote";
import { isPathInside } from "./project-detector";

interface GitHead {
  readonly name?: string;
}

interface GitRemote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD?: GitHead;
    readonly remotes?: readonly GitRemote[];
  };
}

interface GitApi {
  readonly repositories: readonly GitRepository[];
}

interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

export interface BranchDisplay {
  readonly name: string;
  readonly source: "git" | "state" | "unknown";
}

export interface RepositoryDisplay {
  readonly providerLabel: "GitHub" | "Repository";
  readonly name: string;
  readonly source: "git" | "unavailable";
  readonly remoteName?: string;
}

export interface GitContextDisplay {
  readonly branch: BranchDisplay;
  readonly repository: RepositoryDisplay;
}

function fallbackBranch(stateBranch?: string): BranchDisplay {
  return stateBranch
    ? { name: stateBranch, source: "state" }
    : {
        name: "Not detected — open this project as a Git repository",
        source: "unknown",
      };
}

function unavailableRepository(): RepositoryDisplay {
  return {
    providerLabel: "Repository",
    name: "Not detected — add a remote with Git tools",
    source: "unavailable",
  };
}

function safeRemoteName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, 120) : undefined;
}

function describeRepository(remotes: readonly GitRemote[] | undefined): RepositoryDisplay {
  const ordered = [...(remotes ?? [])].sort((left, right) => {
    if (left.name === "origin") return -1;
    if (right.name === "origin") return 1;
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  for (const remote of ordered) {
    const parsed = parseGitRemote(remote.fetchUrl ?? remote.pushUrl);
    if (parsed) {
      return {
        providerLabel: parsed.providerLabel,
        name: parsed.repositoryLabel,
        source: "git",
        remoteName: safeRemoteName(remote.name),
      };
    }
  }

  const configuredRemote = ordered[0];
  if (configuredRemote) {
    const remoteName = safeRemoteName(configuredRemote.name);
    return {
      providerLabel: "Repository",
      name: remoteName ? `${remoteName} remote configured` : "Remote configured",
      source: "git",
      ...(remoteName ? { remoteName } : {}),
    };
  }

  return unavailableRepository();
}

export async function readGitContext(
  projectRoot: string,
  stateBranch?: string,
): Promise<GitContextDisplay> {
  const fallback: GitContextDisplay = {
    branch: fallbackBranch(stateBranch),
    repository: unavailableRepository(),
  };

  try {
    const gitExtension = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
    if (!gitExtension) {
      return fallback;
    }

    const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
    const api = exports.getAPI(1);
    const repositories = api.repositories
      .filter((repository) => isPathInside(repository.rootUri.fsPath, projectRoot))
      .sort((left, right) => right.rootUri.fsPath.length - left.rootUri.fsPath.length);
    const repository = repositories[0];
    if (!repository) return fallback;

    const branchName = repository.state.HEAD?.name?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return {
      branch: branchName
        ? { name: branchName.slice(0, 200), source: "git" }
        : fallbackBranch(stateBranch),
      repository: describeRepository(repository.state.remotes),
    };
  } catch {
    // Git integration is optional; state is the documented fallback.
  }

  return fallback;
}

export async function readBranch(
  projectRoot: string,
  stateBranch?: string,
): Promise<BranchDisplay> {
  return (await readGitContext(projectRoot, stateBranch)).branch;
}
