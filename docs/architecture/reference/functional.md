# Functional Architecture

What an agent built on this pattern does for its users, independent of domain. Each section ends with the requirement a new domain must meet.

## Actors

| Actor | What they do |
|---|---|
| **Operator** | The person who owns the data and talks to the agent: a store admin, an account manager, an analyst |
| **Tenant** | The account the data belongs to. One store, one workspace, one database. Every session is bound to exactly one tenant |
| **Source system** | The platform or data set the agent reads and changes. It owns the truth; the agent never caches it as its own |
| **Agent** | Reasons over the operator's question, writes code to read the source, and proposes changes |

**Requirement:** every request resolves to one operator and one tenant before the model runs.

## Capabilities

The agent has five capabilities. A domain can drop one, but it should not add a sixth without recording why.

1. **Answer.** Turn a question into reads against the source and return a sourced answer. "Which customers ordered twice this month?"
2. **Explain.** Answer "how do I…" from the domain's help corpus, with links. No source reads are needed.
3. **Render.** Return structured results as components, such as a metric card, a table or a chart, not only as prose.
4. **Act.** Change the source on the operator's behalf, behind a preview and an approval.
5. **Stay in context.** Know what the operator is looking at, such as "order 1042", and scope questions to it without being told.

## Trust tiers

Every operation in the source falls into one tier. The tier decides how the agent may run it, whatever the domain.

| Tier | Example | How it runs |
|---|---|---|
| **Read** | List orders, count customers | Freely, inside the read sandbox, many per turn |
| **Write** | Create a coupon, change a price | Preview first, then run only after the operator approves |
| **Destructive** | Delete a product, cancel an order, refund | Same as write, with the preview stating what cannot be undone |
| **Out of scope** | Change billing, manage users, rotate keys | Never registered as a tool |

Two rules hold in every domain:

- **The model never decides that a write is approved.** Approval is an operator action the host records, such as a button click that redeems a pending-action ID. A tool argument the model can set, like `confirmed: true`, does not count.
- **The agent only registers operations the tenant's credentials allow.** If a token lacks a scope, the tool for it does not appear to the model.

**Requirement:** a table that maps every source operation you expose to a tier and to the permission scope it needs.

## The operator contract

What the operator can rely on, stated as behavior:

- **Answers come from the source, not from memory.** If a read fails, the agent says so and shows the error. It does not guess.
- **Counts are counts.** "How many" questions use the source's count or pagination total, never the length of one page.
- **Nothing changes without a preview.** The preview names the operation, the target and the new values.
- **Every change is logged.** The log shows who approved it, what ran, and what came back.
- **A denied change stays denied.** After a rejection, the agent may suggest an alternative, but it does not retry the same call.
- **Limits are visible.** Rate limits and timeouts surface as plain messages, not as silent truncation.

## Conversation shape

```
operator asks ──► agent reads (one script, many calls) ──► answer + components
                                │
operator asks to change ──► agent proposes ──► preview card ──► Approve / Reject
                                                                     │
                                          host runs the write ◄──────┘
                                          audit row written
                                          agent reports the result
```

A turn that only reads finishes in one model turn, however many source calls it makes. A write always spans two operator actions: the request and the approval.

## Output

The agent's reply is text plus zero or more **blocks**. A block is a typed component reference with props, such as a metric card, a table, a timeline or an error card. The domain picks its catalog. The protocol for emitting and rendering blocks stays the same.

**Requirement:** a block catalog of 5 to 10 components that covers the domain's common answers, each with a stated "use when" line.

## Context injection

The host tells the agent which entity the operator is looking at when the chat opens from a detail page. The agent scopes its reads to that entity unless the operator asks otherwise.

**Requirement:** a list of the entity types that can open the chat, and the identifier each one passes.

## History

Conversation history belongs to the operator's client or to the tenant's session. It is not shared across tenants, and it is never used as a cache of source data.
