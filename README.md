# Mentor AI — ANN Guardian

ANN Guardian is a local-first AI engineering supervision system designed to keep large AI-assisted software projects aligned with their original master plan, rules, architecture, and decisions.

## Core idea

ANN is not another coding model. It is the project-control layer around coding workers.

```text
User
  -> ANN Guardian
  -> Runtime / session adapter
  -> Antigravity CLI / Gemini worker
  -> isolated Git branch/worktree
  -> source changes
  -> deterministic checks + source/impact analysis
  -> Guardian decision
  -> PASS / REPAIR / BLOCK / ESCALATE
```

Optional components:
- OpenClaw: runtime/session orchestration.
- GitLens: human branch/worktree/diff observation.
- GPT: high-level mentor escalation only when needed.

## Why this project exists

Long-running AI coding projects tend to drift: the worker can make code pass while forgetting why the system was designed a certain way. ANN persists project truth outside model context and checks changes against it.

The authoritative project documents live in `.ann/`:
- `MASTER_PLAN.md`
- `RULES.md`
- `CORE_INVARIANTS.yaml`
- `ARCHITECTURE.md`

Coding agents must also read `AGENTS.md` before implementation.

## Current status

Foundation / M0 in progress.

Implemented scaffold:
- TypeScript project foundation.
- Domain contracts for tasks, task capsules, changes, verification and Guardian reports.
- Initial deterministic Guardian engine.
- Replaceable worker-adapter contract.
- Initial Antigravity CLI adapter using stream-json output.
- Guardian unit tests.

Next milestones:
1. M1 — Project state, task state, Git/process abstractions.
2. M2 — Production Antigravity session/process bridge.
3. M3 — Deterministic Source Intelligence.
4. M4 — Traceability Engine.
5. M5 — Guardian impact/drift/rule gates.
6. M6 — Verification pipeline.
7. M7+ — OpenClaw, GitLens workflow, GPT escalation, multi-worker.

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm run build
npm test
```

## Non-negotiable design rules

- Do not implement directly on `main`.
- Do not let workers rewrite Master Plan/Core Invariants silently.
- Do not weaken tests simply to obtain a green build.
- Do deterministic verification before expensive AI review.
- Keep runtime/model providers replaceable.
- Do not commit secrets.
- Architectural changes require explicit proposal/approval.

See `.ann/MASTER_PLAN.md` and `AGENTS.md` before coding.
