# Agent Reference Architecture

A domain-neutral architecture for building an AI agent that reads and changes data in a system someone else owns. Ask BC is the worked example. Start here when you build the same kind of agent for a different platform, data set or audience.

## Contents

- [What this is for](#what-this-is-for)
- [The one boundary](#the-one-boundary)
- [Read order](#read-order)
- [Where Ask BC sits today](#where-ask-bc-sits-today)

## What this is for

The pattern fits any product where a person asks questions about their own data, and sometimes asks the agent to change it. A store admin, a CRM, a ticket tracker, a warehouse or a file archive all qualify.

The documents answer two questions:

- What does the agent have to do for its users? See [functional.md](functional.md).
- Which parts do you build, which do you reuse, and which do you write fresh per domain? See [technical.md](technical.md).

The research behind those answers is in [decisions.md](decisions.md), with its sources and the condition that would reopen each one. Read that before you research any of it again.

## The one boundary

Every agent of this kind splits into a **core** that stays the same and a **domain adapter** that you write per domain.

```
core (reuse as-is)                     domain adapter (write per domain)
─────────────────────────              ──────────────────────────────────
session runtime, one per tenant        source spec or schema
read sandbox (code mode)               install flow and credential storage
host-enforced write gate               write operation → permission scope map
audit wrapper on every call            entity context ("the user is viewing X")
model routing by role                  UI block catalog
block protocol (text + components)     help or docs corpus
eval harness                           domain prompt rules
```

When you start a new domain, you copy the core and write only the right-hand column. If a change you need lands in the left-hand column, either the core has a gap or your domain is not this pattern. Record which one in `decisions.md`.

## Read order

1. [functional.md](functional.md): capabilities, trust tiers, and the user-facing contract.
2. [technical.md](technical.md): the layers, their interfaces, and the tool-surface decision.
3. [new-domain-playbook.md](new-domain-playbook.md): the steps from an empty repo to a gated agent on a new domain.
4. [decisions.md](decisions.md): what is settled, the evidence, and when to revisit.

## Where Ask BC sits today

Ask BC implements most of the core. It falls short in four places, and a new domain should not copy them:

| Gap | Ask BC today | Reference target |
|---|---|---|
| Write gate | The model sets `confirmed: true` itself; only the prompt stops a first-call write | The host holds the write until the user approves it in the UI |
| Tool surface | 22 read tools written by hand over generated types | Generate from the spec, then curate |
| Evals | None; one smoke endpoint | Golden questions, tool-selection checks, adversarial write cases |
| Codemode version | `0.3.4`, without connectors or approval pauses | Current release, version pinned |

The details for each are in [technical.md](technical.md) and [decisions.md](decisions.md).
