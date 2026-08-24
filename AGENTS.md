# Codex / Coding Agent Instructions

This repository builds ANN Guardian. Before modifying source, read:
1. `.ann/MASTER_PLAN.md`
2. `.ann/RULES.md`
3. `.ann/CORE_INVARIANTS.yaml`
4. `.ann/ARCHITECTURE.md`

## Mandatory behavior
- Never directly modify protected project-truth files unless the user explicitly requests an approved governance change.
- Never work directly on `main`.
- Never remove or weaken tests simply to make checks pass.
- Prefer deterministic parsing/checking before introducing LLM calls.
- Keep OpenClaw, Antigravity/Gemini, GPT, GitHub, and future providers behind replaceable adapters.
- Do not log, commit, or echo credentials.
- For architectural changes, create a proposal instead of silently implementing the change.
- Every implementation task must define verification and acceptance criteria.

## Development loop
Inspect -> plan -> implement narrowly -> typecheck/test -> inspect diff -> report risks and remaining work.
