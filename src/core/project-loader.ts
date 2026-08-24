import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ProjectStateError,
  ProjectStateStore,
  type ProjectStateErrorCode,
} from './project-state-store.js';

const REQUIRED_AUTHORITY_FILES = [
  '.ann/MASTER_PLAN.md',
  '.ann/RULES.md',
  '.ann/CORE_INVARIANTS.yaml',
  '.ann/ARCHITECTURE.md',
] as const;

type AuthorityRelativePath = (typeof REQUIRED_AUTHORITY_FILES)[number];

export type ProjectLoadErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'GIT_REPOSITORY_NOT_FOUND'
  | 'ANN_DIRECTORY_MISSING'
  | 'AUTHORITY_VALIDATION_FAILED'
  | 'STATE_MALFORMED';

export interface ProjectLoadIssue {
  code:
    | 'AUTHORITY_FILE_MISSING'
    | 'AUTHORITY_FILE_EMPTY'
    | 'AUTHORITY_FILE_INVALID'
    | 'STATE_JSON_INVALID'
    | 'STATE_PROJECT_ID_INVALID'
    | 'STATE_SCHEMA_INVALID'
    | 'STATE_VERSION_UNSUPPORTED'
    | 'STATE_SECRET_REJECTED'
    | 'STATE_READ_FAILED';
  path: string;
  message: string;
}

export class ProjectLoadError extends Error {
  constructor(
    readonly code: ProjectLoadErrorCode,
    message: string,
    readonly issues: ProjectLoadIssue[] = [],
  ) {
    super(message);
    this.name = 'ProjectLoadError';
  }
}

export interface AuthorityDocument {
  relativePath: AuthorityRelativePath;
  absolutePath: string;
  content: string;
  sha256: string;
}

export interface RepositoryMetadata {
  rootPath: string;
  gitMarkerPath: string;
  gitMarkerKind: 'directory' | 'file';
  packageJsonPath?: string;
  packageName?: string;
}

export interface LoadedProject {
  projectId: string;
  projectIdSource: 'state' | 'package' | 'directory';
  workspacePath: string;
  repository: RepositoryMetadata;
  annDirectoryPath: string;
  authority: Record<AuthorityRelativePath, AuthorityDocument>;
  stateFilePath?: string;
}

export async function loadProject(startPath: string): Promise<LoadedProject> {
  const workspacePath = await resolveWorkspacePath(startPath);
  const repositoryRoot = await findRepositoryRoot(workspacePath);
  const gitMarkerPath = join(repositoryRoot, '.git');
  const gitMarkerKind = await getGitMarkerKind(gitMarkerPath);

  const annDirectoryPath = join(repositoryRoot, '.ann');
  if (!(await exists(annDirectoryPath))) {
    throw new ProjectLoadError(
      'ANN_DIRECTORY_MISSING',
      `ANN authority directory was not found at ${annDirectoryPath}`,
    );
  }

  const authority = await loadAuthorityDocuments(repositoryRoot);
  const stateResult = await readOptionalProjectState(repositoryRoot);
  const packageMetadata = await readOptionalPackageMetadata(repositoryRoot);

  const directoryId = normalizeProjectId(basename(repositoryRoot));
  const packageId = packageMetadata.packageName
    ? normalizeProjectId(packageMetadata.packageName)
    : undefined;

  const projectId = stateResult.projectId ?? packageId ?? directoryId;
  const projectIdSource: LoadedProject['projectIdSource'] = stateResult.projectId
    ? 'state'
    : packageId
      ? 'package'
      : 'directory';

  return {
    projectId,
    projectIdSource,
    workspacePath,
    repository: {
      rootPath: repositoryRoot,
      gitMarkerPath,
      gitMarkerKind,
      packageJsonPath: packageMetadata.packageJsonPath,
      packageName: packageMetadata.packageName,
    },
    annDirectoryPath,
    authority,
    stateFilePath: stateResult.stateFilePath,
  };
}

async function resolveWorkspacePath(startPath: string): Promise<string> {
  const absolutePath = resolve(startPath);

  let startStat;
  try {
    startStat = await stat(absolutePath);
  } catch {
    throw new ProjectLoadError(
      'WORKSPACE_NOT_FOUND',
      `Workspace path does not exist: ${absolutePath}`,
    );
  }

  return startStat.isDirectory() ? absolutePath : dirname(absolutePath);
}

async function findRepositoryRoot(startPath: string): Promise<string> {
  let current = startPath;

  while (true) {
    if (await exists(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new ProjectLoadError(
    'GIT_REPOSITORY_NOT_FOUND',
    `No Git repository was found from workspace path ${startPath}`,
  );
}

async function getGitMarkerKind(gitMarkerPath: string): Promise<'directory' | 'file'> {
  const markerStat = await stat(gitMarkerPath);
  return markerStat.isDirectory() ? 'directory' : 'file';
}

async function loadAuthorityDocuments(
  repositoryRoot: string,
): Promise<Record<AuthorityRelativePath, AuthorityDocument>> {
  const issues: ProjectLoadIssue[] = [];
  const entries: Array<[AuthorityRelativePath, AuthorityDocument]> = [];

  for (const relativePath of REQUIRED_AUTHORITY_FILES) {
    const absolutePath = join(repositoryRoot, relativePath);

    if (!(await exists(absolutePath))) {
      issues.push({
        code: 'AUTHORITY_FILE_MISSING',
        path: absolutePath,
        message: `Required authority file is missing: ${relativePath}`,
      });
      continue;
    }

    const content = await readFile(absolutePath, 'utf8');
    if (content.trim().length === 0) {
      issues.push({
        code: 'AUTHORITY_FILE_EMPTY',
        path: absolutePath,
        message: `Required authority file is empty: ${relativePath}`,
      });
      continue;
    }

    if (!isAuthorityDocumentStructurallyValid(relativePath, content)) {
      issues.push({
        code: 'AUTHORITY_FILE_INVALID',
        path: absolutePath,
        message: `Required authority file is structurally invalid: ${relativePath}`,
      });
      continue;
    }

    entries.push([
      relativePath,
      {
        relativePath,
        absolutePath,
        content,
        sha256: createHash('sha256').update(content).digest('hex'),
      },
    ]);
  }

  if (issues.length > 0) {
    throw new ProjectLoadError(
      'AUTHORITY_VALIDATION_FAILED',
      'ANN authority validation failed.',
      issues,
    );
  }

  return Object.fromEntries(entries) as Record<AuthorityRelativePath, AuthorityDocument>;
}

function isAuthorityDocumentStructurallyValid(
  relativePath: AuthorityRelativePath,
  content: string,
): boolean {
  switch (relativePath) {
    case '.ann/MASTER_PLAN.md':
      return content.includes('# ANN Master Plan') && content.includes('## Authority order');
    case '.ann/RULES.md':
      return content.includes('# ANN Rules') && content.includes('## R-001');
    case '.ann/CORE_INVARIANTS.yaml':
      return content.includes('invariants:') && /(?:^|\n)\s*- id:\s*INV-/m.test(content);
    case '.ann/ARCHITECTURE.md':
      return content.includes('# ANN Architecture') && content.includes('Guardian');
  }
}

async function readOptionalProjectState(
  repositoryRoot: string,
): Promise<{ projectId?: string; stateFilePath?: string }> {
  const store = new ProjectStateStore(repositoryRoot);
  try {
    const state = await store.load();
    return state ? { projectId: state.projectId, stateFilePath: store.stateFilePath } : {};
  } catch (error) {
    if (!(error instanceof ProjectStateError)) throw error;

    throw new ProjectLoadError(
      'STATE_MALFORMED',
      `Project state is invalid: ${store.stateFilePath}`,
      error.issues.map((issue) => ({
        code: toProjectLoadIssueCode(issue.code),
        path: issue.path,
        message: issue.message,
      })),
    );
  }
}

function toProjectLoadIssueCode(code: ProjectStateErrorCode): ProjectLoadIssue['code'] {
  switch (code) {
    case 'STATE_JSON_INVALID':
    case 'STATE_SCHEMA_INVALID':
    case 'STATE_VERSION_UNSUPPORTED':
    case 'STATE_SECRET_REJECTED':
    case 'STATE_READ_FAILED':
      return code;
    default:
      return 'STATE_SCHEMA_INVALID';
  }
}

async function readOptionalPackageMetadata(
  repositoryRoot: string,
): Promise<{ packageJsonPath?: string; packageName?: string }> {
  const packageJsonPath = join(repositoryRoot, 'package.json');
  if (!(await exists(packageJsonPath))) {
    return {};
  }

  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { name?: unknown };
    return {
      packageJsonPath,
      packageName: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined,
    };
  } catch {
    return { packageJsonPath };
  }
}

function normalizeProjectId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
