import * as vscode from "vscode";

import { isPathInside } from "./project-detector";

interface GitHead {
  readonly name?: string;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: { readonly HEAD?: GitHead };
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

function fallbackBranch(stateBranch?: string): BranchDisplay {
  return stateBranch ? { name: stateBranch, source: "state" } : { name: "unknown", source: "unknown" };
}

export async function readBranch(
  projectRoot: string,
  stateBranch?: string,
): Promise<BranchDisplay> {
  try {
    const gitExtension = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
    if (!gitExtension) {
      return fallbackBranch(stateBranch);
    }

    const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
    const api = exports.getAPI(1);
    const repositories = api.repositories
      .filter((repository) => isPathInside(repository.rootUri.fsPath, projectRoot))
      .sort((left, right) => right.rootUri.fsPath.length - left.rootUri.fsPath.length);
    const branchName = repositories[0]?.state.HEAD?.name?.trim();
    if (branchName) {
      return { name: branchName.slice(0, 200), source: "git" };
    }
  } catch {
    // Git integration is optional; state is the documented fallback.
  }

  return fallbackBranch(stateBranch);
}
