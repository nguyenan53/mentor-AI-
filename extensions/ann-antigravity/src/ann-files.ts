export type AnnFileId =
  | "masterPlan"
  | "rules"
  | "coreInvariants"
  | "architecture"
  | "projectState";

export interface AnnFileDescriptor {
  readonly id: AnnFileId;
  readonly label: string;
  readonly relativePath: string;
  readonly command: string;
  readonly governance: boolean;
  readonly readOnly: true;
}

export const ANN_AUTHORITY_MARKER = ".ann/MASTER_PLAN.md";

export const ANN_FILES: readonly AnnFileDescriptor[] = Object.freeze([
  Object.freeze({
    id: "masterPlan",
    label: "Master Plan",
    relativePath: ANN_AUTHORITY_MARKER,
    command: "annGuardian.openMasterPlan",
    governance: true,
    readOnly: true,
  }),
  Object.freeze({
    id: "rules",
    label: "Rules",
    relativePath: ".ann/RULES.md",
    command: "annGuardian.openRules",
    governance: true,
    readOnly: true,
  }),
  Object.freeze({
    id: "coreInvariants",
    label: "Core Invariants",
    relativePath: ".ann/CORE_INVARIANTS.yaml",
    command: "annGuardian.openCoreInvariants",
    governance: true,
    readOnly: true,
  }),
  Object.freeze({
    id: "architecture",
    label: "Architecture",
    relativePath: ".ann/ARCHITECTURE.md",
    command: "annGuardian.openArchitecture",
    governance: true,
    readOnly: true,
  }),
  Object.freeze({
    id: "projectState",
    label: "Project State",
    relativePath: ".ann/PROJECT_STATE.json",
    command: "annGuardian.openProjectState",
    governance: false,
    readOnly: true,
  }),
]);

export const GOVERNANCE_FILES: readonly AnnFileDescriptor[] = Object.freeze(
  ANN_FILES.filter((file) => file.governance),
);
export const WATCHED_ANN_PATHS: readonly string[] = Object.freeze(
  ANN_FILES.map((file) => file.relativePath),
);

export function getAnnFile(id: AnnFileId): AnnFileDescriptor {
  const descriptor = ANN_FILES.find((file) => file.id === id);
  if (!descriptor) {
    throw new Error(`Unknown ANN file id: ${id}`);
  }

  return descriptor;
}
