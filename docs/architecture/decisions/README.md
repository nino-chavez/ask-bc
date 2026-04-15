# Architecture Decision Records

Decisions that shape Ask BC's architecture. Each ADR follows the standard format: context, decision, consequences, alternatives considered. Documented decisions — not auto-generated summaries of code — because the value of an ADR is capturing *why*, and the why is what rots first.

## Index

| ID | Title | Status | Date |
|---|---|---|---|
| [ADR-001](./001-codemode-agent-runtime.md) | Codemode Agent Runtime on Cloudflare | Accepted | 2026-04-15 |

## Adding a new ADR

1. Copy `template.md` to `NNN-kebab-case-title.md` where `NNN` is the next sequential number
2. Fill in context (what's forcing the decision), decision (what changed), consequences (positive/negative/neutral), alternatives considered (at least two), and references
3. Add a row to the index above
4. Commit with a message starting `docs(adr):`
