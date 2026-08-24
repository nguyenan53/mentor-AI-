# GPT Mentor Bridge

## Purpose

The GPT Mentor Bridge is an escalation path, not the primary execution engine. ANN, deterministic verification, and Gemini/Antigravity must remain usable when the mentor is unavailable.

## V1 principle

Use the user's normal ChatGPT workflow without requiring OpenAI API billing or Codex runtime usage.

ANN does not automate ChatGPT login, copy browser cookies, scrape private sessions, or treat a ChatGPT subscription as an API credential.

## V1 flow

```text
Worker/Gemini
    -> Guardian detects escalation condition
    -> Context Compiler builds Mentor Packet
    -> Secret/Privacy Filter sanitizes packet
    -> ANN stores packet as an auditable artifact
    -> User selects Ask GPT Mentor
    -> ANN copies packet to clipboard
    -> ANN opens configured ChatGPT project/conversation URL
    -> User pastes packet into ChatGPT
    -> GPT returns mentor decision
    -> User pastes/imports the decision into ANN
    -> ANN records decision and creates a repair/approval task
    -> Gemini/Antigravity continues work
```

## Mentor Packet schema

A packet should be compact and evidence-focused.

Required sections:
- `packet_id`
- `project_id`
- `task_id`
- current milestone
- objective
- current status
- escalation reason
- relevant Master Plan items
- relevant invariants/rules/ADRs
- affected files/symbols
- minimal relevant diff or diff summary
- deterministic verification results
- worker diagnosis
- previous repair attempts
- Guardian diagnosis
- explicit question for mentor
- allowed actions
- prohibited actions

Optional sections:
- dependency slice
- execution trace
- selected logs
- alternative solutions already considered

The packet must not contain the complete repository unless the user explicitly chooses to include it.

## Example packet

```text
PACKET ID
mentor-2026-0017

PROJECT
Mentor AI / ANN

TASK
M5-014

OBJECTIVE
Prevent worker task planning from bypassing Guardian approval.

ESCALATION
Architecture drift, HIGH severity.

RELEVANT AUTHORITY
INV-001: Guardian/project truth authoritative over worker suggestions.
R-004: worker cannot self-approve.
R-009: passing tests do not override architecture drift.

AFFECTED SYMBOLS
src/runtime/worker.ts::enqueueTask
src/guardian/gate.ts::approve

VERIFICATION
Typecheck: PASS
Tests: 217 PASS / 0 FAIL
Drift check: FAIL

WORKER PROPOSAL
Allow WorkerManager to enqueue follow-up tasks directly.

GUARDIAN ASSESSMENT
Technically functional, but transfers planning authority to worker runtime.

QUESTION
Repair current implementation, rollback, or approve an architecture change proposal?

PROHIBITED
Do not modify Master Plan/Core Invariants automatically.
```

## Sanitization rules

Before a packet leaves ANN, remove or redact:
- API keys and access tokens.
- passwords and credentials.
- cookies/session secrets.
- `.env` contents.
- private headers.
- signing secrets.
- unrelated customer/user data.
- unnecessary absolute paths when a repository-relative path is enough.

The sanitizer should support configurable regex rules plus explicit secret-provider boundaries.

## Decision import

A mentor response is not executable code by default.

ANN imports it as a `MentorDecision` artifact containing:
- decision ID.
- source: manual ChatGPT mentor.
- packet ID.
- recommendation.
- constraints.
- requested next action.
- user approval state.

Guardian converts an approved mentor decision into a normal task or repair instruction. Existing invariants still apply unless the user explicitly approves a governance/architecture change.

## URL handling

ANN may store a user-configured ChatGPT URL for convenience. The URL is only a navigation target.

ANN must not:
- store ChatGPT passwords.
- extract ChatGPT authentication cookies.
- impersonate the user's browser session.
- assume `?q=` URL parameters provide a stable ChatGPT API.

## Future V2 adapter

An optional OpenAI API mentor adapter may later automate escalation.

Requirements:
- opt-in only.
- explicit cost controls.
- per-day/per-task input/output budgets.
- same Mentor Packet schema.
- same sanitizer.
- same audit trail.
- API failure must not block ANN normal operation.

## Cost-control model

Preferred hierarchy:
1. deterministic checks — no model cost.
2. Gemini/Antigravity worker — primary AI workload.
3. cheap/local semantic reviewer — optional.
4. GPT Mentor — rare high-value escalation.

## Acceptance tests

- Guardian escalation produces a valid packet.
- Packet contains only traceability-relevant context.
- Known test secrets are redacted.
- Packet is persisted with a unique ID.
- User can configure/update the ChatGPT target URL.
- Manual mentor response can be imported and linked to the original task/packet.
- Mentor decision cannot silently rewrite protected project-truth files.
- ANN remains fully usable with Mentor Bridge disabled.
