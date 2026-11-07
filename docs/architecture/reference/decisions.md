# Settled Decisions

The research behind the reference architecture, so a new domain starts from it instead of repeating it. Each entry gives the decision, the evidence with its source and the date it was checked, and the condition that would reopen it. Reopen a decision only when its "revisit when" condition is met, and record the new evidence here.

Evidence labels:

- **Fetched**: the source was read on the date shown.
- **Measured**: Ask BC ran the test itself. The sample is stated.
- **Claimed**: an earlier document states it, and nobody has re-checked it.

## D-1 Reads run as code, not as one tool call each

- **Decision:** the model gets one `execute` tool and writes a script against typed functions. It does not get one tool call per API operation.
- **Evidence:**
  - Fetched 2026-11-07. Cloudflare's Code Mode post argues that models write code against an API better than they call tools directly, and that the sandbox reaches the outside world only through the typed API. <https://blog.cloudflare.com/code-mode/>
  - Fetched 2026-11-07. Anthropic reports one Drive-to-Salesforce workflow dropping from 150,000 to 2,000 tokens when tools are called from code. Intermediate results stay in the execution environment. <https://www.anthropic.com/engineering/code-execution-with-mcp>
  - Measured, April 2026, one demo store, two questions (ADR-001). A repeat-buyer breakdown the old tool loop could not finish took 6.5 s as one script. "Top-selling products this month" took 7 tool calls and hit the step cap on the old stack. It took 13.4 s as one script and recovered from 3 API errors.
- **Revisit when:** a model's native tool loop finishes multi-call joins inside its step budget on the golden-question suite.

## D-2 Call the source directly; use MCP for many services

- **Decision:** when the agent talks to one platform, the runtime calls that platform's API directly with the tenant's credentials. Use a vendor MCP server when one exists and fits, or when the agent connects to several services.
- **Evidence:**
  - Fetched 2026-11-07. UTCP describes a "manual" of tool definitions, converts OpenAPI specs into one, and has clients call the existing endpoints with no wrapper server. Auth uses variable placeholders. <https://www.utcp.io/>
  - Fetched 2026-11-07. The MCP spec (2026-07-28 revision) defines tools, resources and prompts on the server side, OAuth 2.1-based authorization for HTTP transports, and a human in the loop who can deny tool calls. <https://modelcontextprotocol.io/specification/latest>
  - Watched 2026-11-07, a short explainer comparing the two. MCP puts the integration work in the vendor's server and gives every service one protocol. UTCP removes the middle hop but needs a usable spec and a login per service. <https://www.youtube.com/shorts/7VfKiaGOZcA>
- **Why not MCP everywhere:** one platform gains nothing from a protocol hop, and the runtime already holds the credential.
- **Revisit when:** the agent adds a second source system.

## D-3 Generate the tool surface from the spec, then curate

- **Decision:** derive one typed tool per operation from the source's OpenAPI spec, and let the model find them through search. Hand-write a tool only where the spec misleads the model or an answer needs domain logic.
- **Evidence:**
  - Fetched 2026-11-07. Cloudflare's API MCP server covers 2,500+ endpoints with `search`, `execute` and `docs` tools. Its docs put Code Mode at about 1,000 tokens, against about 1,170,000 for native MCP with full schemas. <https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/>
  - Fetched 2026-11-07. `@cloudflare/codemode` ships `OpenApiConnector`, which reads the spec once on the host and derives one typed tool per operation, and `McpConnector`, which wraps an MCP server. <https://github.com/cloudflare/agents/tree/main/packages/codemode>
  - Checked 2026-11-07 against the npm tarballs. Neither connector exists in `0.3.4`, the version Ask BC pins. Both exist in `0.5.6`, the latest release.
  - Fetched 2026-11-07. Anthropic's tool-writing guidance: consolidate steps, return high-signal context, namespace tools, keep responses token-efficient, and test tools with evals. <https://www.anthropic.com/engineering/writing-tools-for-agents>
- **Why Ask BC hand-wrote 22 tools:** its codemode version had no spec connector. The hand-written layer also encodes real quirks, such as V2 bare arrays, string-typed numbers and a dedicated `getOrderCount`. Port those quirks to the curated layer; do not drop them.
- **Revisit when:** a generated surface fails the tool-selection suite on more than a few questions, and curation cannot fix it.

## D-4 The host enforces write approval, not the model

- **Decision:** a write runs only after an operator approval that the host recorded and bound to the previewed arguments.
- **Evidence:**
  - Fetched 2026-11-07. The AI SDK supports tool approval: a tool call can end in an approval request, and the app answers with an approval response. Per-tool `needsApproval` still works but is deprecated in favor of `toolApproval`. <https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-execution-approval>
  - Fetched 2026-11-07. In `@cloudflare/codemode` 0.5.x, a tool marked `requiresApproval: true` pauses `execute()` until `approve()` or `reject()` runs. Tools can carry a `revert` for rollback.
  - Read 2026-11-07, Ask BC source. Write tools take a `confirmed` boolean that the model sets. The system prompt tells it to preview first, but no host check stops `confirmed: true` on the first call. A code comment in `index.ts` claims `needsApproval: true`; no tool definition uses it.
- **Revisit when:** never for the invariant. The mechanism can change.

## D-5 Writes stay out of the read sandbox unless the sandbox can pause

- **Decision:** with a sandbox that cannot pause, register write tools outside it, as Ask BC does. With a sandbox that pauses for approval (codemode 0.5.x connectors), writes may live inside it, provided every one is marked as needing approval.
- **Evidence:** D-4 sources, and Ask BC's S-3 control.
- **Revisit when:** the sandbox's approval pause is shown to be bypassable from generated code.

## D-6 Route models by the turn's role

- **Decision:** a fast model takes default turns. A stronger model takes continuation turns: retries after errors, the turn after an approval, and recovery.
- **Evidence:** Claimed in ADR-001, April 2026: the fast model handled every normal turn in testing, at about a third of the cost and 2.6 times the speed of the stronger one. That claim was made for the Claude 4.5/4.6 generation and has not been re-measured.
- **Revisit when:** a new model generation ships. Re-run the golden-question suite on the fast tier and compare.

## D-7 Session runtime on Durable Objects; UI stays where the host needs it

- **Decision:** run the agent runtime as one Durable Object per tenant. Keep the host UI on whatever platform the host app already requires.
- **Evidence:** Claimed in ADR-001. Dynamic Workers start in under 10 ms against 200–800 ms for microVM sandboxes. Durable Objects sleep at zero cost when idle. Moving Ask BC's UI too would have re-tested OAuth, iframe cookies and CSP for no product gain.
- **Rejected alternatives (ADR-001):** a microVM sandbox on the UI host; a full platform migration; a plan-executor meta-tool, which batches calls but cannot aggregate, render blocks or gate writes.
- **Revisit when:** the host platform ships an equivalent stateful, per-tenant runtime, or the tenant count makes the per-object model costly.

## D-8 One agent loop, no multi-agent orchestration

- **Decision:** a single agent with a read sandbox and a write gate. No planner agents, sub-agents or agent-to-agent protocols.
- **Evidence:** Fetched 2026-11-07. Anthropic separates workflows (predefined code paths) from agents (the model directs its own tool use), and advises the simplest solution that works. <https://www.anthropic.com/engineering/building-effective-agents>
- **Revisit when:** one operator task needs parallel, independent work over more context than one session holds.

## D-9 Evals are part of the build, not a later phase

- **Decision:** golden-question, tool-selection and adversarial write-gate suites exist before the agent reaches a real tenant.
- **Evidence:** the D-3 tool-writing guidance. Ask BC's system prompt carries hand-written rules for counting and pagination (`meta.pagination.total`, "never count the length of page one"). Nothing checks that the model follows them. A tool-selection suite is what would check them.
- **Revisit when:** never for the requirement.

## Open questions

These are not settled, and the reference does not pick an answer:

- **MCP tool annotations** (`readOnlyHint`, `destructiveHint`): could they replace the scope map's tier column for MCP sources? The spec says clients must treat annotations from untrusted servers as untrusted. Their definitions were not fetched for this record.
- **Embedding search for the help corpus:** keyword scoring is enough for Ask BC's corpus of 46 entries. The size at which it stops being enough has not been measured.
