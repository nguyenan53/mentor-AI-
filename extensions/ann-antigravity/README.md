# ANN Guardian Home

ANN Guardian Home is a thin, local-first UI adapter for ANN projects. UX0.5 makes four different contexts explicit:

```text
Local User → GPT Web Account → ANN Personal Project → optional ChatGPT Project
```

ANN Core remains authoritative for project truth, tasks, Git/process behavior, verification, and future execution.

## UX0.5 behavior

- **Home** separates Local User, GPT Web Account, current ANN project, ChatGPT Project, Master Plan, task, and next action.
- **Account Center** opens the official ChatGPT login page and records a local account label only after the user explicitly confirms browser login.
- Browser login is always user-confirmed metadata and **NOT VERIFIED BY ANN**. ANN never reads email, cookies, browser storage, passwords, or session tokens.
- **My Projects** lists local registry entries with root, Master Plan availability, GPT account mapping, optional ChatGPT Project link, and last-opened time.
- **Open Existing ANN Project** detects `.ann/MASTER_PLAN.md` read-only before asking to add the folder to the local registry.
- **New Personal Project** is a five-step UX shell that selects an existing folder and writes registry metadata only after Review → Add Project.
- One local GPT account context and one optional validated HTTPS ChatGPT Project URL can be associated with each registered ANN project.
- Missing folders, Master Plans, accounts, mappings, and links have explicit next actions instead of raw `unknown` values.
- The UX0 manual ChatGPT link remains readable and is migrated only after the user explicitly registers that project.

## Storage and safety boundary

User labels, login-confirmation timestamps, project registry entries, account mappings, and ChatGPT links live in VS Code extension `globalState`. The versioned serializer whitelists fields and normalizes stable absolute project roots; Windows roots are identified case-insensitively.

UX0.5 does not:

- copy or modify project source;
- create folders, `.ann`, Git repositories, tasks, or governance files;
- overwrite `.ann/MASTER_PLAN.md` or update `.ann/PROJECT_STATE.json`;
- scrape browser sessions or call documented/undocumented ChatGPT APIs;
- use OpenAI API keys or conflate API billing with ChatGPT web access;
- run a terminal command on activation;
- start Antigravity workers, OpenClaw, or Guardian behavior.

`Run Verification` remains an explicit action in an existing governed, trusted workspace.

## Install in Antigravity IDE

1. Open Antigravity IDE.
2. Extensions → ... → Install from VSIX...
3. Select `ann-guardian-control-room-0.3.0.vsix`.
4. Reload Antigravity and open ANN from Home or My Projects.

## Development

```text
npm ci
npm run check
npm run package:vsix
npm run verify:vsix
```

The generated VSIX is written to `out/ann-guardian-control-room-0.3.0.vsix` and is ignored by Git.
