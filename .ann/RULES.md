# ANN Rules

## R-001 Authority
Workers must obey the authority order defined in `.ann/MASTER_PLAN.md`.

## R-002 Protected project truth
AI workers must not directly modify `.ann/MASTER_PLAN.md`, `.ann/CORE_INVARIANTS.yaml`, or approved ADRs. Changes require an explicit architecture proposal and user approval.

## R-003 Git isolation
Implementation workers must use a dedicated branch or worktree. Direct changes to `main` are prohibited.

## R-004 No self-approval
A worker that authors a change cannot be the sole authority approving architectural or invariant-sensitive changes.

## R-005 Tests are requirements
A worker may update tests only when the requirement itself has been explicitly changed. Removing or weakening a test only to obtain a green build is prohibited.

## R-006 Deterministic-first verification
Git diff, compiler/typecheck, lint, tests, dependency checks, and source graph checks run before model-based semantic review.

## R-007 Traceability
Every meaningful change must have a task ID and must be traceable to at least one milestone, requirement, invariant, ADR, or approved bug fix.

## R-008 Context compilation
Workers receive task capsules containing only relevant plan, rules, decisions, source symbols, constraints, and acceptance criteria. Full repository conversation history is not a required dependency.

## R-009 Drift protection
Passing tests do not override architecture or invariant violations. Guardian may block a technically passing change when it causes project drift.

## R-010 Escalation
GPT or another premium mentor is optional and invoked only for unresolved, high-risk, security, architectural, or user-requested decisions.

## R-011 Credentials
Secrets must never be committed, printed in logs, embedded in prompts, or persisted in project state. Use environment/keychain/secret storage.

## R-012 Runtime replaceability
OpenClaw, Antigravity, Gemini, GPT, and future models are adapters. ANN project truth and Guardian logic must not depend on one vendor-specific runtime.
