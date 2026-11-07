# New Domain Playbook

The steps from an empty repo to a gated agent on a new domain. Each step names what to copy from Ask BC, what to write fresh, and the check that ends the step. Work through them in order: the evals in step 6 depend on the scope map from step 2.

## 0. Confirm the domain fits

The pattern fits when all four hold:

- One operator works on one tenant's data at a time.
- The source system has an API, a queryable database or a structured file set.
- Most questions are reads, and changes are occasional and reviewable.
- A preview can describe a change before it happens.

If changes must run unattended, such as nightly syncs or bulk jobs, this is a workflow, not this agent. See D-8 in [decisions.md](decisions.md).

**Done when:** you can write five real operator questions and two real change requests for the domain.

## 1. Inventory the source

For each source system, record:

| Field | Example |
|---|---|
| Access shape | OpenAPI spec, vendor MCP server, SQL, files |
| Spec quality | Complete, partial, wrong in known places |
| Auth model | OAuth app install, API key per tenant, service role |
| Scopes | The permission names the source grants |
| Rate limits | Requests per second, per tenant |
| Quirks | Bare arrays, string-typed numbers, empty-body responses, page caps |

Pick the tool-surface shape per source with the table in [technical.md § Tool surface](technical.md#7-tool-surface).

**Done when:** every source has a shape and a list of known quirks.

## 2. Write the scope map

One row per operation you expose: operation, tier (read, write, destructive, out of scope), required scope, and preview text for writes. This table drives tool registration, scope filtering, the write gate and the adversarial evals.

- **Copy from Ask BC:** the `WRITE_TOOL_SCOPES` map and `filterWriteToolsByScope()` in `workers/agent-runtime/src/index.ts`.
- **Extend it:** Ask BC filters writes only. Filter reads by scope too.

**Done when:** every operation has a tier, and nothing in the write or destructive tier lacks preview text.

## 3. Stand up the core

Copy these from Ask BC and rename the domain terms. The table lists what to change in each.

| Ask BC file | Keep | Change |
|---|---|---|
| `workers/agent-runtime/wrangler.jsonc` | Durable Object binding, `worker_loaders`, SQLite class | Names, vars, secrets list |
| `workers/agent-runtime/src/index.ts` (the `AskBC` class) | `beforeTurn` role routing, rate limit, `execute` audit wrapper, auth gate in `fetch()` | Class name, tenant claim, system prompt |
| `workers/agent-runtime/src/credentials.ts` | Per-turn resolve, AES-256-GCM decrypt | Key prefix, credential shape |
| `workers/agent-runtime/src/blocks.ts` | `BlockSchema` shape, `renderBlockCatalog()` | The catalog entries |
| `src/components/chat/` | Panel, parser, registry, block renderer | Design system, components |

Upgrade before you build on it. Ask BC pins `@cloudflare/codemode` 0.3.4. The current release has the spec and MCP connectors and the approval pause this playbook relies on (D-3, D-4). Pin the exact version you test.

**Done when:** a seeded test tenant can connect, and `execute` runs a script that calls one stub function.

## 4. Build the tool surface

1. Generate typed functions from the spec: an `OpenApiConnector`, or `openapi-typescript` with `openapi-fetch` as Ask BC does.
2. Add the curated layer: a count function for every listable entity, plus wrappers for each quirk from step 1.
3. Tag every function with its tier from step 2.
4. Write descriptions that say when to use each one.

For a database source, expose one read-only `query` function bound to a SELECT-only role, plus a schema summary in the prompt. Expose writes as named operations.

**Done when:** the five questions from step 0 each run as one script and return correct data on the test tenant.

## 5. Build the write gate

Implement the gate from [technical.md § Write gate](technical.md#6-write-gate) with a host-enforced primitive: AI SDK tool approval, or codemode `requiresApproval`. Do not copy Ask BC's `confirmed` boolean.

- The preview card shows the operation, the target and the new values.
- Approve and Reject are UI events that reach the host, not chat messages the model reads.
- Each approved write logs who approved it, the arguments and the result.

**Done when:** the two change requests from step 0 each produce a preview and run only after Approve.

## 6. Write the evals

Build the three suites from [technical.md § Eval harness](technical.md#11-eval-harness) against the test tenant:

- **Golden questions:** 20 or more, with expected answers taken from the source directly, not from the agent.
- **Tool selection:** at least one case per quirk from step 1.
- **Adversarial writes:** an injected instruction inside a source record, a model attempt to approve its own write, and arguments changed after a preview.

**Done when:** all three suites run with one command and fail on purpose when you break a tool description or remove the gate.

## 7. Domain dressing

Write the rest of the domain adapter:

- **Block catalog:** 5 to 10 components with "use when" lines.
- **Entity context:** the detail pages that can open the chat, and the ID each one passes.
- **Help corpus:** a keyword list of the domain's how-to articles.
- **Domain prompt rules:** units, date conventions and counting rules. Keep this short; push rules into tool descriptions where you can.

**Done when:** the golden-question suite passes with blocks rendered, and an operator on a detail page gets scoped answers without naming the entity.

## 8. Record what changed

If any step forced a change to the core, add an entry to [decisions.md](decisions.md) with the evidence and a "revisit when" line. A core change that two domains need belongs in the reference. A change that only one needs belongs in that domain's adapter.

## What not to research again

These are settled in [decisions.md](decisions.md). Read the entry before reopening one:

- Code mode against one tool call per operation (D-1)
- Direct calls against MCP for a single platform (D-2)
- Generating against hand-writing the tool surface (D-3)
- Where the write gate lives and who enforces it (D-4, D-5)
- One-model against two-model routing (D-6)
- Durable Objects against a microVM sandbox for the runtime (D-7)
- Single agent against multi-agent (D-8)
