# ANN Guardian Home

ANN Guardian Home is a thin UI adapter for ANN projects. UX0 presents the current local context without taking
ownership away from ANN Core: user label, project/root, read-only Git remote and branch, Master Plan readiness,
persisted task status, terminal readiness, a manual ChatGPT Mentor link, and one clear next action.

It is not a Guardian implementation and does not own task creation or transitions, Git writes, architecture
decisions, terminal automation, worker sessions, browser authentication, or model orchestration.

## UX0 behavior

- Activates when the ANN Home view opens or a workspace contains `.ann/MASTER_PLAN.md`.
- Supports deterministic nested and multi-root ANN project selection.
- Displays `PROJECT_STATE.json` defensively without modifying or repairing it.
- Reads the current branch and sanitized repository identity from the built-in Git extension when available.
- Shows the configured terminal shell and project root without opening a terminal or executing a command.
- Stores the local user label and per-project ChatGPT labels/URL in VS Code extension global state, never in the repo.
- Opens only validated HTTPS `chatgpt.com` links, and only after an explicit user command.
- Always labels a saved ChatGPT link `CONFIGURED — NOT VERIFIED`; it never inspects browser sign-in, cookies, or sessions.
- Opens authority/state files only after an explicit user command.
- Runs `npm run check` only after the user selects `ANN: Run Verification` in a trusted workspace.
- Shows actionable missing states instead of inventing connection or Guardian status.

## Privacy and safety

The extension has no telemetry, background HTTP requests, model calls, `.env` reads, credential reads, automatic commands,
Git writes, task transitions, or project write-back behavior. Local UX metadata must not contain credentials, secrets,
or API keys. Git remote display excludes usernames, passwords, and query strings.

## Install in Antigravity IDE

1. Open Antigravity IDE.
2. Extensions → ... → Install from VSIX...
3. Select `ann-guardian-control-room-0.2.0.vsix`.
4. Reload Antigravity and open the ANN repository.

The package targets stable VS Code-compatible APIs from `^1.85.0`.

## Development

```text
npm ci
npm run check
npm run package:vsix
npm run verify:vsix
```

The generated VSIX is written to `out/ann-guardian-control-room-0.2.0.vsix` and is intentionally ignored by Git.
