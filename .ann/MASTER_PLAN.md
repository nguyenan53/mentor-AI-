# ANN Master Plan

## Mission
Build a local-first AI engineering supervision system where deterministic project knowledge and rules remain authoritative, Gemini/Antigravity performs most implementation work, and GPT is optional escalation rather than a runtime dependency.

## Core architecture
User -> ANN Guardian -> Runtime/Orchestrator -> Antigravity CLI/Gemini Worker -> isolated Git worktree -> Source -> deterministic verification -> Guardian decision.

Optional layers: OpenClaw for runtime/session orchestration; GitLens for human observation; GPT for high-level escalation.

## Authority order
1. User intent
2. Core invariants
3. Master plan
4. Architecture
5. ADR decisions
6. Milestone
7. Task
8. AI suggestion

## Product principles
- Local source is the source of truth.
- Git is mandatory for traceability and rollback.
- GitHub is optional remote collaboration/backup, never the runtime source of truth.
- Workers operate on isolated branches/worktrees.
- Deterministic checks run before expensive AI review.
- Project knowledge is persisted outside model context.
- Every meaningful code change must trace to a task, milestone, rule, or approved decision.
- Architectural drift must be detectable even when tests pass.

## Delivery phases
### Alpha
M0 Constitution and repository foundation.
M1 ANN Core: project state, rules, task state, Git/process abstractions.
M2 Antigravity Bridge: long-running CLI worker adapter and structured events.
M3 Source Intelligence: repository/module/file/symbol mapping without LLM parsing.

### Beta
M4 Traceability Engine: plan <-> milestone <-> task <-> symbol <-> test.
M5 Guardian Engine: impact, rule gate, drift detection, change decisions.
M6 Verification Pipeline: compiler/lint/test/diff/behavior gates.

### 1.0
M7 OpenClaw adapter as optional runtime/session provider.
M8 GitLens-friendly branch/worktree workflow.
M9 GPT escalation packets, manual first and API optional.
M10 Multi-worker scheduling with isolated worktrees.

## Non-goals for V1
- Custom IDE.
- Autonomous merge to main.
- Continuous GPT review.
- Mandatory cloud backend.
- Mandatory GitHub runtime.
- Swarms before single-worker correctness.
- AI-authorized changes to this master plan.
