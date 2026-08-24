import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  PROJECT_STATE_SCHEMA_VERSION,
  type ProjectState,
  type ProjectStateInput,
  type ProjectVerificationSummary,
  type ProjectVerificationStatus,
} from '../domain/types.js';

export type ProjectStateErrorCode =
  | 'STATE_NOT_FOUND'
  | 'STATE_JSON_INVALID'
  | 'STATE_SCHEMA_INVALID'
  | 'STATE_VERSION_UNSUPPORTED'
  | 'STATE_SECRET_REJECTED'
  | 'STATE_READ_FAILED'
  | 'STATE_WRITE_FAILED';

export interface ProjectStateIssue {
  code: ProjectStateErrorCode;
  path: string;
  field?: string;
  message: string;
}

export class ProjectStateError extends Error {
  constructor(
    readonly code: ProjectStateErrorCode,
    message: string,
    readonly issues: ProjectStateIssue[],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ProjectStateError';
  }
}

export interface ProjectStateStoreIO {
  readTextFile(path: string): Promise<string>;
  writeTempFile(path: string, content: string): Promise<void>;
  replaceFile(sourcePath: string, destinationPath: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export interface ProjectStateStoreOptions {
  now?: () => Date;
  createTemporaryId?: () => string;
  io?: Partial<ProjectStateStoreIO>;
}

export type ProjectStateUpdater = (
  current: Readonly<ProjectState>,
) => ProjectState | ProjectStateInput;

const STATE_FILE_RELATIVE_PATH = join('.ann', 'PROJECT_STATE.json');

const PROJECT_STATE_KEYS = new Set([
  'schemaVersion',
  'projectId',
  'currentMilestone',
  'currentTaskId',
  'activeBranch',
  'activeWorktree',
  'workerSessionId',
  'lastCheckpoint',
  'verification',
  'updatedAt',
]);

const VERIFICATION_KEYS = new Set(['status', 'summary']);
const VERIFICATION_STATUSES = new Set<ProjectVerificationStatus>(['NOT_RUN', 'PASSED', 'FAILED']);

const OPTIONAL_STRING_FIELDS = [
  'currentMilestone',
  'currentTaskId',
  'activeBranch',
  'activeWorktree',
  'workerSessionId',
  'lastCheckpoint',
] as const;

const CREDENTIAL_VALUE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|password|secret)\s*[:=]\s*\S+/i,
];

const defaultIO: ProjectStateStoreIO = {
  async readTextFile(path) {
    return await readFile(path, 'utf8');
  },
  async writeTempFile(path, content) {
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(content, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async replaceFile(sourcePath, destinationPath) {
    await rename(sourcePath, destinationPath);
  },
  async removeFile(path) {
    await rm(path, { force: true });
  },
};

export class ProjectStateStore {
  readonly stateFilePath: string;

  private readonly now: () => Date;
  private readonly createTemporaryId: () => string;
  private readonly io: ProjectStateStoreIO;

  constructor(repositoryRoot: string, options: ProjectStateStoreOptions = {}) {
    this.stateFilePath = join(resolve(repositoryRoot), STATE_FILE_RELATIVE_PATH);
    this.now = options.now ?? (() => new Date());
    this.createTemporaryId = options.createTemporaryId ?? randomUUID;
    this.io = { ...defaultIO, ...options.io };
  }

  async load(): Promise<ProjectState | undefined> {
    let rawState: string;

    try {
      rawState = await this.io.readTextFile(this.stateFilePath);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return undefined;
      }

      throw new ProjectStateError(
        'STATE_READ_FAILED',
        `Project state could not be read: ${this.stateFilePath}`,
        [
          {
            code: 'STATE_READ_FAILED',
            path: this.stateFilePath,
            message: 'PROJECT_STATE.json could not be read. No state was modified.',
          },
        ],
        error,
      );
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(rawState) as unknown;
    } catch (error) {
      throw new ProjectStateError(
        'STATE_JSON_INVALID',
        `Project state JSON is malformed: ${this.stateFilePath}`,
        [
          {
            code: 'STATE_JSON_INVALID',
            path: this.stateFilePath,
            message: 'PROJECT_STATE.json could not be parsed as JSON. The file was not modified.',
          },
        ],
        error,
      );
    }

    return validateProjectState(candidate, this.stateFilePath, 'load');
  }

  async save(candidate: ProjectState | ProjectStateInput): Promise<ProjectState> {
    const state = validateProjectState(candidate, this.stateFilePath, 'save', this.now());
    const temporaryPath = `${this.stateFilePath}.${process.pid}.${this.createTemporaryId()}.tmp`;
    let replaced = false;

    try {
      await this.io.writeTempFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
      await this.io.replaceFile(temporaryPath, this.stateFilePath);
      replaced = true;
      return state;
    } catch (error) {
      throw new ProjectStateError(
        'STATE_WRITE_FAILED',
        `Project state could not be saved atomically: ${this.stateFilePath}`,
        [
          {
            code: 'STATE_WRITE_FAILED',
            path: this.stateFilePath,
            message: 'Atomic state replacement failed. The previous state was not intentionally removed.',
          },
        ],
        error,
      );
    } finally {
      if (!replaced) {
        try {
          await this.io.removeFile(temporaryPath);
        } catch {
          // Preserve the original structured write error. A unique orphan temp file is never loaded as state.
        }
      }
    }
  }

  async update(updater: ProjectStateUpdater): Promise<ProjectState> {
    const current = await this.load();
    if (!current) {
      throw new ProjectStateError(
        'STATE_NOT_FOUND',
        `Project state does not exist: ${this.stateFilePath}`,
        [
          {
            code: 'STATE_NOT_FOUND',
            path: this.stateFilePath,
            message: 'Create project state before attempting an update.',
          },
        ],
      );
    }

    return await this.save(updater(structuredClone(current)));
  }
}

function validateProjectState(
  candidate: unknown,
  stateFilePath: string,
  mode: 'load' | 'save',
  now?: Date,
): ProjectState {
  const credentialField = findCredentialMaterial(candidate);
  if (credentialField) {
    throw new ProjectStateError(
      'STATE_SECRET_REJECTED',
      `Credential-like data is not allowed in project state: ${stateFilePath}`,
      [
        {
          code: 'STATE_SECRET_REJECTED',
          path: stateFilePath,
          field: credentialField,
          message: 'Credential-like data was rejected and was not persisted.',
        },
      ],
    );
  }

  if (!isRecord(candidate)) {
    throw schemaError(stateFilePath, [schemaIssue(stateFilePath, '$', 'State must be a JSON object.')]);
  }

  const schemaVersion = candidate.schemaVersion;
  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion)) {
    if (schemaVersion !== PROJECT_STATE_SCHEMA_VERSION) {
      throw new ProjectStateError(
        'STATE_VERSION_UNSUPPORTED',
        `Project state schema version is unsupported: ${stateFilePath}`,
        [
          {
            code: 'STATE_VERSION_UNSUPPORTED',
            path: stateFilePath,
            field: '$.schemaVersion',
            message: `Only project state schema version ${PROJECT_STATE_SCHEMA_VERSION} is supported.`,
          },
        ],
      );
    }
  }

  const issues: ProjectStateIssue[] = [];
  for (const key of Object.keys(candidate)) {
    if (!PROJECT_STATE_KEYS.has(key)) {
      issues.push(schemaIssue(stateFilePath, `$.${key}`, 'Unknown project state field.'));
    }
  }

  if (schemaVersion === undefined) {
    if (mode === 'load') {
      issues.push(schemaIssue(stateFilePath, '$.schemaVersion', 'schemaVersion is required.'));
    }
  } else if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    issues.push(schemaIssue(stateFilePath, '$.schemaVersion', 'schemaVersion must be an integer.'));
  }

  const projectId = normalizeProjectId(candidate.projectId);
  if (!projectId) {
    issues.push(schemaIssue(stateFilePath, '$.projectId', 'projectId must be a non-empty project ID string.'));
  } else if (mode === 'load' && candidate.projectId !== projectId) {
    issues.push(schemaIssue(stateFilePath, '$.projectId', 'projectId must use its normalized form.'));
  }

  const optionalValues: Partial<
    Pick<
      ProjectState,
      | 'currentMilestone'
      | 'currentTaskId'
      | 'activeBranch'
      | 'activeWorktree'
      | 'workerSessionId'
      | 'lastCheckpoint'
    >
  > = {};

  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value === undefined) continue;

    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(schemaIssue(stateFilePath, `$.${field}`, `${field} must be a non-empty string when present.`));
      continue;
    }

    const normalizedValue = value.trim();
    if (mode === 'load' && normalizedValue !== value) {
      issues.push(schemaIssue(stateFilePath, `$.${field}`, `${field} must not have surrounding whitespace.`));
      continue;
    }
    optionalValues[field] = normalizedValue;
  }

  const verification = validateVerification(candidate.verification, stateFilePath, issues, mode);

  let persistedUpdatedAt: string | undefined;
  if (candidate.updatedAt !== undefined) {
    if (typeof candidate.updatedAt !== 'string' || !isCanonicalTimestamp(candidate.updatedAt)) {
      issues.push(
        schemaIssue(stateFilePath, '$.updatedAt', 'updatedAt must be a canonical ISO-8601 UTC timestamp.'),
      );
    } else {
      persistedUpdatedAt = candidate.updatedAt;
    }
  } else if (mode === 'load') {
    issues.push(schemaIssue(stateFilePath, '$.updatedAt', 'updatedAt is required.'));
  }

  if (issues.length > 0 || !projectId || !verification) {
    throw schemaError(stateFilePath, issues);
  }

  const updatedAt = mode === 'save' ? getSaveTimestamp(now, stateFilePath) : persistedUpdatedAt;
  if (!updatedAt) {
    throw schemaError(stateFilePath, [schemaIssue(stateFilePath, '$.updatedAt', 'updatedAt is required.')]);
  }

  return {
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    projectId,
    ...optionalValues,
    verification,
    updatedAt,
  };
}

function validateVerification(
  candidate: unknown,
  stateFilePath: string,
  issues: ProjectStateIssue[],
  mode: 'load' | 'save',
): ProjectVerificationSummary | undefined {
  if (!isRecord(candidate)) {
    issues.push(schemaIssue(stateFilePath, '$.verification', 'verification must be an object.'));
    return undefined;
  }

  for (const key of Object.keys(candidate)) {
    if (!VERIFICATION_KEYS.has(key)) {
      issues.push(schemaIssue(stateFilePath, `$.verification.${key}`, 'Unknown verification field.'));
    }
  }

  const status = candidate.status;
  if (typeof status !== 'string' || !VERIFICATION_STATUSES.has(status as ProjectVerificationStatus)) {
    issues.push(
      schemaIssue(
        stateFilePath,
        '$.verification.status',
        'verification.status must be NOT_RUN, PASSED, or FAILED.',
      ),
    );
  }

  const summary = candidate.summary;
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    issues.push(
      schemaIssue(stateFilePath, '$.verification.summary', 'verification.summary must be a non-empty string.'),
    );
  } else if (mode === 'load' && summary.trim() !== summary) {
    issues.push(
      schemaIssue(
        stateFilePath,
        '$.verification.summary',
        'verification.summary must not have surrounding whitespace.',
      ),
    );
  }

  if (
    typeof status !== 'string' ||
    !VERIFICATION_STATUSES.has(status as ProjectVerificationStatus) ||
    typeof summary !== 'string' ||
    summary.trim().length === 0
  ) {
    return undefined;
  }

  return { status: status as ProjectVerificationStatus, summary: summary.trim() };
}

function getSaveTimestamp(now: Date | undefined, stateFilePath: string): string {
  try {
    return (now ?? new Date()).toISOString();
  } catch (error) {
    throw new ProjectStateError(
      'STATE_WRITE_FAILED',
      `Project state timestamp could not be created: ${stateFilePath}`,
      [
        {
          code: 'STATE_WRITE_FAILED',
          path: stateFilePath,
          field: '$.updatedAt',
          message: 'The state clock did not produce a valid timestamp. No state was written.',
        },
      ],
      error,
    );
  }
}

function normalizeProjectId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || undefined;
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function findCredentialMaterial(value: unknown): string | undefined {
  return findCredentialMaterialAt(value, '$', new WeakSet<object>());
}

function findCredentialMaterialAt(
  value: unknown,
  path: string,
  visited: WeakSet<object>,
): string | undefined {
  if (typeof value === 'string') {
    return CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value)) ? path : undefined;
  }

  if (typeof value !== 'object' || value === null) return undefined;
  if (visited.has(value)) return undefined;
  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isCredentialLikeField(key)) return childPath;

    const nestedMatch = findCredentialMaterialAt(child, childPath, visited);
    if (nestedMatch) return nestedMatch;
  }

  return undefined;
}

function isCredentialLikeField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalized === 'env' ||
    normalized === 'environment' ||
    normalized.includes('apikey') ||
    normalized.includes('password') ||
    normalized.includes('passwd') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('privatekey') ||
    normalized.includes('token') ||
    normalized === 'authorization' ||
    normalized.includes('cookie')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function schemaIssue(stateFilePath: string, field: string, message: string): ProjectStateIssue {
  return {
    code: 'STATE_SCHEMA_INVALID',
    path: stateFilePath,
    field,
    message,
  };
}

function schemaError(stateFilePath: string, issues: ProjectStateIssue[]): ProjectStateError {
  return new ProjectStateError(
    'STATE_SCHEMA_INVALID',
    `Project state schema validation failed: ${stateFilePath}`,
    issues,
  );
}
