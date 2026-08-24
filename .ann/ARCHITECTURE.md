# ANN Architecture

## Components

### ANN Core
Owns project identity, state, tasks, rules, process adapters, Git integration, and event flow. It must be usable without OpenClaw or GPT.

### Source Intelligence
Builds repository -> module -> file -> symbol maps using deterministic parsers and language tooling. LLMs are not the primary parser.

### Traceability Engine
Links plan items, milestones, tasks, source symbols, tests, decisions, and invariants.

### Guardian Engine
Evaluates proposed/applied changes against rules, traceability, deterministic verification, impact, and architectural drift. Decisions: PASS, WARNING, REPAIR_REQUIRED, ARCHITECTURE_REVIEW_REQUIRED, BLOCKED.

### Runtime Adapter
Provides sessions and worker lifecycle. OpenClaw is an optional implementation, never authority.

### Worker Adapter
Antigravity CLI/Gemini is the primary planned implementation worker. Worker adapters operate inside isolated branches/worktrees and return structured events/results.

### Mentor Adapter
GPT or another premium model receives a compact manager packet only when escalation criteria are met. The system must continue to function when no mentor adapter exists.

## Standard task lifecycle
1. Resolve current project state.
2. Create task with milestone and acceptance criteria.
3. Resolve relevant invariants/rules/ADRs/source symbols.
4. Compile Task Capsule.
5. Prepare isolated Git branch/worktree.
6. Worker analyzes and proposes implementation.
7. Guardian preflight rule check.
8. Worker implements.
9. Source Intelligence incrementally re-indexes changed symbols.
10. Run deterministic verification.
11. Perform dependency/impact analysis.
12. Perform traceability and drift checks.
13. Guardian decides PASS/REPAIR/BLOCK/ESCALATE.
14. Create checkpoint and update persisted project state.

## Data boundaries
- `.ann/` stores human-readable project truth and generated state metadata.
- Source files remain normal repository source.
- Secrets live outside the repository.
- Runtime session IDs may be persisted, but credentials may not.
- Git local repository is the change-history authority; GitHub is optional remote infrastructure.

## V1 technology direction
- TypeScript/Node.js 20+
- SQLite or structured JSON for initial persisted state
- Git CLI for machine operations
- Tree-sitter/LSP/compiler APIs for source mapping
- Antigravity CLI stream JSON adapter
- OpenClaw adapter after Guardian works independently
