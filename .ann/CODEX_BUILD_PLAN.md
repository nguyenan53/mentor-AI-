# Codex Build Plan for ANN

Codex is used to build ANN. Codex is not a required ANN runtime dependency after the system is operational.

## Global execution rule

For every implementation unit:

```text
READ AUTHORITY
-> INSPECT CURRENT SOURCE
-> PROPOSE NARROW PLAN
-> IMPLEMENT ON FEATURE BRANCH/WORKTREE
-> RUN DETERMINISTIC CHECKS
-> REVIEW DIFF
-> REPORT EVIDENCE/RISKS
-> ONLY THEN ADVANCE
```

Codex must read before implementation:
1. `.ann/MASTER_PLAN.md`
2. `.ann/RULES.md`
3. `.ann/CORE_INVARIANTS.yaml`
4. `.ann/ARCHITECTURE.md`
5. `.ann/MILESTONES.md`
6. `AGENTS.md`

Protected governance files are not implementation targets unless the user explicitly requests a governance change.

---

# Build Stage A — M1 ANN Core

## M1.1 Project Loader
Implement:
- repository/workspace discovery.
- `.ann` authority-file discovery.
- project ID and repository metadata.
- validation for missing/invalid governance files.

Tests:
- valid project loads.
- missing `.ann` returns structured error.
- malformed state does not destroy existing files.

Exit gate:
- `npm run check` PASS.

## M1.2 Persistent Project State
Implement durable state for:
- project ID.
- active milestone.
- active task.
- branch/worktree.
- worker session reference.
- last checkpoint.
- verification status.

Requirements:
- atomic writes.
- crash-safe recovery strategy.
- no credentials in state.

Exit gate:
- state survives process restart.

## M1.3 Task State Machine
Minimum states:
- CREATED
- CONTEXT_READY
- ANALYZING
- READY_TO_IMPLEMENT
- IMPLEMENTING
- VERIFYING
- REPAIR_REQUIRED
- BLOCKED
- ESCALATED
- COMPLETE
- CANCELLED

Requirements:
- invalid transitions rejected.
- transition reason/evidence recorded.

## M1.4 Git Abstraction
Implement read-first Git service:
- status.
- diff/diff-stat.
- current branch.
- refs.
- merge-base.
- fetch.
- worktree discovery.

Write operations must be explicit and guarded.

Do not auto-pull/merge while a worker is actively editing.

## M1.5 Process Abstraction
Implement:
- spawn.
- streamed stdout/stderr.
- cancellation.
- timeout.
- exit metadata.
- secret-safe logging.

No Antigravity-specific code in generic process layer.

## M1.6 M1 Integration Gate
Scenario:
1. open repository.
2. load authority files.
3. create task.
4. persist task/project state.
5. query Git state.
6. restart ANN.
7. restore identical project/task state.

M1 is complete only when this scenario is automated and passing.

---

# Build Stage B — M2 Antigravity Bridge

## M2.1 CLI Capability Detection
Detect:
- `agy` executable.
- version/capabilities.
- authentication-ready vs unavailable state without exposing credentials.

## M2.2 Stream Protocol
Harden `AntigravityWorkerAdapter`:
- incremental JSON framing.
- malformed-event handling.
- stderr classification.
- exit codes.
- conversation/session ID extraction.

## M2.3 Session Continuation
Implement:
- new session.
- continue session.
- stop session.
- process crash recovery.
- state linkage to task.

## M2.4 Task Capsule Compiler
Input:
- task.
- relevant plan/rules/invariants.
- ADRs.
- source slice.
- acceptance criteria.
- prohibited changes.

Output:
- compact worker instruction.

The compiler must not blindly include whole conversation history.

## M2.5 Worker Safety Boundary
Enforce:
- isolated branch/worktree.
- protected project-truth path checks.
- secret filtering.
- structured changed-file reporting.

## M2.6 M2 Integration Gate
ANN creates a task -> compiles capsule -> invokes Antigravity -> receives structured result -> persists session -> continues same session -> cancels cleanly.

---

# Build Stage C — M3 Source Intelligence

## M3.1 Repository Inventory
Index:
- files.
- languages.
- packages/projects.
- entrypoints.
- test locations.
- build configuration.

## M3.2 TypeScript/JavaScript Symbol Mapper
Extract:
- modules.
- imports/exports.
- classes/interfaces/types.
- functions/methods.
- symbol locations.

## M3.3 Dependency Graph
Represent direct code dependencies with stable IDs.

## M3.4 Incremental Index
On Git/file changes, re-index only affected files plus required dependency edges.

## M3.5 Changed Symbol Detector
Map Git diff hunks to source symbols where possible.

## M3.6 M3 Integration Gate
Given a controlled fixture change, ANN identifies changed file -> changed symbol -> direct dependencies -> related tests without calling an LLM.

---

# Build Stage D — M4 Traceability

## M4.1 Traceability Data Model
Entities:
- invariant.
- plan item.
- ADR.
- milestone.
- task.
- module/file/symbol.
- test.

## M4.2 Bidirectional Links
Support questions:
- Why does this symbol exist?
- Which code implements this invariant?
- Which tests protect this plan requirement?
- What requirements may this diff affect?

## M4.3 Missing Trace Detection
Meaningful untraceable changes produce a warning or block based on policy.

## M4.4 M4 Integration Gate
Fixture change must produce an evidence path from changed symbol to task/requirement and relevant test.

---

# Build Stage E — M5 Guardian

## M5.1 Rule Gate
Convert core rules/invariants into executable checks where deterministic checks are possible.

## M5.2 Impact Analysis
Use changed symbols + dependency graph + traceability to build an impact set.

## M5.3 Drift Detector
Compare intended architecture/authority relationships to current source behavior/ownership boundaries.

Initial drift classes:
- authority drift.
- protected-boundary bypass.
- unapproved architecture dependency.
- test weakening/removal.
- traceability loss.
- worker self-approval.

## M5.4 Evidence-backed Guardian Reports
Every non-PASS result must include:
- finding ID.
- severity.
- evidence.
- relevant authority.
- affected source.
- recommended action.

## M5.5 M5 Integration Gate
Create fixture where tests pass but worker bypasses a protected Guardian boundary. Guardian must BLOCK it with evidence.

---

# Build Stage F — M6 Verification

## M6.1 Verification Profiles
Project-configurable commands for:
- typecheck.
- lint.
- build.
- unit tests.
- integration tests.

## M6.2 Verification Result Normalizer
Normalize command output into structured status/evidence.

## M6.3 Pipeline Ordering
Run cheap deterministic checks before expensive semantic review.

## M6.4 Repair Loop
On recoverable failure:
- create repair context.
- return to worker.
- count repair attempt.
- trigger escalation policy when threshold is reached.

## M6.5 M6 Integration Gate
A deliberately broken implementation must fail verification, return a focused repair task, and escalate after configured repeated failures.

---

# Build Stage G — M9 Manual GPT Mentor Bridge

Build M9 manual mentor bridge before any OpenAI API integration.

## M9.1 Mentor Packet Compiler
Implement schema from `GPT_MENTOR_BRIDGE.md`.

## M9.2 Sanitizer
Redact secrets and minimize paths/source/logs.

## M9.3 Manual Handoff UI/API
Capabilities:
- generate packet.
- copy packet.
- open configured ChatGPT target URL.
- save packet artifact.
- import mentor response manually.

## M9.4 Mentor Decision Model
Persist decision linked to packet/task.

The imported decision remains advisory unless user/project policy explicitly grants the requested action.

## M9.5 Escalation Policy
Load `.ann/ESCALATION_POLICY.yaml` and trigger only configured conditions.

## M9.6 M9 Integration Gate
Simulate three worker failures -> Guardian creates sanitized packet -> manual mentor decision imported -> approved repair task created -> worker resumes.

---

# Build Stage H — M7/M8 Integrations

These are intentionally after Guardian correctness.

## M7 OpenClaw
Implement adapter only; do not move project authority into OpenClaw.

## M8 GitLens-friendly Workflow
No hard dependency on GitLens. Expose branch/worktree/task naming so human review is easy.

---

# Build Stage I — M10 Multi-worker

Only start after single-worker M1-M6 and mentor escalation are stable.

Requirements:
- worktree per worker.
- task dependency graph.
- conflict prediction/check before integration.
- no worker merges itself.
- Guardian reviews integration change set.

---

# Codex reporting contract

At the end of each implementation unit, report:

```text
TASK
STATUS
FILES CHANGED
WHY EACH FILE CHANGED
TESTS/CHECKS RUN
RESULTS
RULES/INVARIANTS TOUCHED
RISKS
UNRESOLVED ISSUES
NEXT RECOMMENDED UNIT
```

Do not describe a stage as complete when its integration gate is not automated and passing.
