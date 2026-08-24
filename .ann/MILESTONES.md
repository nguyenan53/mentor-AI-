# ANN Detailed Milestones

This file expands the delivery phases in `MASTER_PLAN.md` without changing its authority or intent.

## M1 — ANN Core
Goal: create the deterministic local core that can operate without OpenClaw, Gemini, or GPT.

Deliverables:
- Project identity and workspace loader.
- Persistent `ProjectState` and `TaskState`.
- Rule/invariant loader.
- Git command abstraction.
- Process abstraction.
- Event bus and structured logging.
- Secret-safe configuration boundary.

Acceptance criteria:
- ANN can open a repository, identify branch/worktree, read project truth, create/update a task, persist state, restart, and restore the same state.
- No AI/model call is required.

## M2 — Antigravity Worker Bridge
Goal: make Antigravity CLI/Gemini the primary replaceable implementation worker.

Deliverables:
- Long-running `agy` process adapter.
- `stream-json` parsing.
- Conversation/session persistence.
- Cancellation, timeout, crash recovery.
- Structured worker events and results.
- Task Capsule prompt compiler.

Acceptance criteria:
- ANN can send a task capsule, receive structured events, preserve the worker session ID, continue the session, stop it, and recover cleanly after process failure.
- Credentials never enter repository state or logs.

## M3 — Source Intelligence
Goal: understand source deterministically before relying on AI semantic judgment.

Deliverables:
- Repository inventory.
- Module/file/symbol graph.
- Imports/exports/dependency relations.
- Function/class extraction.
- Incremental re-indexing of changed files.
- Language adapter interface; TypeScript/JavaScript first.

Preferred tooling:
- Tree-sitter and/or TypeScript compiler API.
- LSP where useful.
- ripgrep and Git for deterministic discovery.

Acceptance criteria:
- ANN can map a changed file to changed symbols and direct dependencies without an LLM call.

## M4 — Traceability Engine
Goal: connect project intent to implementation artifacts.

Graph relationships:
- Invariant <-> Master Plan item.
- Milestone <-> Task.
- Task <-> module/file/symbol.
- Symbol <-> tests.
- ADR <-> affected architecture/source.

Acceptance criteria:
- Given a changed symbol, ANN can identify its task, relevant plan/rules/ADRs, related tests, and impacted source areas.
- Given a plan item or invariant, ANN can identify its implementing code/tests.

## M5 — Guardian Engine
Goal: determine whether a technically working change is also correct for the project.

Deliverables:
- Preflight rule gate.
- Change impact analysis.
- Invariant compliance.
- Architecture drift detection.
- Test-integrity checks.
- Worker self-approval prevention.
- Guardian decisions: PASS, WARNING, REPAIR_REQUIRED, ARCHITECTURE_REVIEW_REQUIRED, BLOCKED.

Acceptance criteria:
- Guardian can block a change that passes tests but violates a protected invariant or architecture boundary.
- Every decision contains evidence and references to the relevant rule/plan/source/test.

## M6 — Verification Pipeline
Goal: make deterministic evidence the first line of review.

Pipeline:
1. Git diff/stat/status.
2. Changed-symbol extraction.
3. Typecheck/compiler.
4. Lint.
5. Unit tests.
6. Integration tests where configured.
7. Dependency/impact checks.
8. Traceability check.
9. Drift check.
10. Guardian decision.

Acceptance criteria:
- Premium-model review is not triggered before deterministic checks complete unless explicitly requested by the user.

## M7 — OpenClaw Runtime Adapter
Goal: optionally use OpenClaw for sessions, routing, skills, background jobs, and multi-agent runtime capabilities.

Rules:
- OpenClaw is an adapter, never the authority for project truth.
- Removing OpenClaw must not make ANN Core/Guardian unusable.

Acceptance criteria:
- ANN can use either its native worker/session path or the OpenClaw adapter with identical Guardian policy.

## M8 — Git/GitLens Control Workflow
Goal: provide isolated machine execution and clear human observation.

Deliverables:
- Branch/worktree manager.
- Default worker isolation.
- Fetch/compare during active work; avoid automatic pull/merge while a worker is modifying code.
- Checkpoint support.
- GitLens-friendly branch/worktree naming and metadata.

Acceptance criteria:
- Every worker task is attributable to a branch/worktree and task ID.
- GitLens is optional; uninstalling it does not affect ANN operation.

## M9 — GPT Mentor Bridge
Goal: escalate only compact, high-value problems to GPT while keeping GPT outside normal project execution.

V1 mode:
- No OpenAI API required.
- ANN generates a sanitized `GPT_MENTOR_PACKET.md`.
- UI offers `Ask GPT Mentor`.
- ANN copies the packet to clipboard and opens a user-configured ChatGPT project/conversation URL.
- User pastes the packet and later pastes the mentor decision back into ANN.

Escalation triggers:
- Repeated worker repair failure.
- Architecture or invariant conflict.
- High-severity drift.
- Security-sensitive decision.
- Ambiguous destructive change.
- Explicit user request.

Acceptance criteria:
- Normal ANN operation does not require GPT.
- No secret, credential, raw `.env`, or unrelated source is included in mentor packets.
- Mentor response becomes an auditable decision/input, not silent automatic authority.

## M10 — Multi-worker Scale
Goal: scale after single-worker correctness is proven.

Deliverables:
- Multiple isolated worktrees.
- Dependency-aware task scheduling.
- Conflict detection before integration.
- Per-worker sessions and task capsules.
- Guardian review before cross-worker integration.

Acceptance criteria:
- Two or more independent workers can operate without sharing mutable worktrees or silently overwriting one another.
- Architecture-sensitive integration still requires Guardian approval.

## Release gates

### Alpha
M0-M3 complete.
ANN can persist project truth, drive one Antigravity worker, and understand changed source symbols.

### Beta
M4-M6 complete.
ANN can prove why a change exists, what it affects, and whether it violates project intent.

### 1.0
M7-M10 complete or intentionally deferred with documented ADRs.
ANN can operate as a long-running project guardian with optional orchestration, human Git visualization, GPT escalation, and controlled multi-worker scale.
