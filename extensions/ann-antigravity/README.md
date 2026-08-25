# ANN Guardian Control Room

ANN Guardian Control Room is a thin, read-only UI adapter for ANN projects. V0 displays the detected project,
persisted project state, authority documents, current Git branch when the built-in Git extension exposes it, and an
explicit verification action.

It is not a Guardian implementation and does not own task transitions, Git behavior, architecture decisions,
traceability, source graphs, worker sessions, or model orchestration.

## V0 behavior

- Activates for workspaces containing `.ann/MASTER_PLAN.md`.
- Supports deterministic nested and multi-root ANN project selection.
- Displays `PROJECT_STATE.json` defensively without modifying or repairing it.
- Opens protected authority files only after an explicit user command.
- Watches visible ANN files and debounces UI refreshes.
- Runs `npm run check` only after the user selects `ANN: Run Verification` in a trusted workspace.
- Uses the built-in Git extension read-only when available, then falls back to `activeBranch` in project state.
- Shows `Guardian: NOT CONNECTED`; V0 never invents PASS/BLOCKED decisions.

## Privacy and safety

The extension has no telemetry, network requests, model calls, `.env` reads, credential reads, automatic commands,
or write-back behavior. It never prints environment variables or full governance/state file contents.

## Install in Antigravity IDE

1. Open Antigravity IDE.
2. Extensions → ... → Install from VSIX...
3. Select ann-guardian-control-room-0.1.0.vsix.
4. Reload Antigravity and open the ANN repository.

The packaged V0 targets stable VS Code-compatible APIs from `^1.85.0`. The locally inspected Antigravity IDE build
uses a VS Code `1.107.0` extension host.

## Development

```text
npm ci
npm run check
npm run package:vsix
npm run verify:vsix
```

The generated VSIX is written to `out/ann-guardian-control-room-0.1.0.vsix` and is intentionally ignored by Git.
