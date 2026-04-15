# ADR-001: Codemode Agent Runtime on Cloudflare

**Date:** 2026-04-15

## Status

Accepted

## Context

Ask BC shipped as a Next.js app on Vercel using the Vercel AI SDK's classic tool-calling loop against fifteen hand-written BigCommerce API wrappers. Cloudflare's announcement of Agent Lee (a platform-native AI assistant for the Cloudflare dashboard) exposed four concrete gaps between our architecture and a production-grade agentic admin console:

1. **Tool-loop round-trip cost.** Every tool call is an LLM round-trip. Compound queries (e.g., "customers who ordered outdoor gear in the last 90 days") chain 5–10 serial calls, hit the `stepCountIs(10)` cap, and degrade into confused partial answers.
2. **Markdown-only output.** The chat surface could render tables via markdown but had no affordance for inline charts, KPI cards, product cards, or any custom component. The "platform-native" feel is capped by what markdown can express.
3. **Read-only.** Ask BC could describe the store but could not change it — no coupon creation, inventory adjustments, product publishing. The functional ceiling is "a report you can ask questions to," not "an operator you can delegate to."
4. **Hand-rolled tool vocabulary.** Adding a new capability required editing code. Agent Lee's `search` + `execute` meta-tools scale with Cloudflare's OpenAPI; Ask BC scales with PRs.

Gap #1 is the biggest, because it compounds: slow queries make the demo feel sluggish, degraded answers make the product feel dumb, and the step cap makes real merchant questions fail at the bottom of a funnel where the user has already typed the hardest thing they'll try that day.

The Agent Lee post attributes its advantage to **Codemode**: instead of making tool calls, the model writes TypeScript that calls typed APIs, and that TypeScript executes in a sandboxed environment. One generated script can chain twenty API calls with parallelism, joins, and in-memory aggregation — all without a single LLM round-trip between them. Cloudflare subsequently published the primitives that back Agent Lee as open libraries: `@cloudflare/think` (opinionated agent base class), `@cloudflare/codemode` (code-over-tool-calling execution), `@cloudflare/shell` (sandboxed shell runtime), and `agents` (Durable-Object-backed agent framework). Dynamic Workers provide the sandbox: code injected at runtime, <10ms cold start, V8 isolate isolation, zero idle cost.

Empirical testing during Phase 0 confirmed the advantage is real:

| Question | Old stack (Vercel tool-loop) | New stack (Codemode + Haiku 4.5) |
|---|---|---|
| "Break down customers by order frequency, show top 3 repeat buyers" | Not attempted — would chain 5+ calls, hit step cap | 6.5s, one script, parallel fetch, pagination, in-memory join |
| "Top-selling products this month?" | 7 tool calls, hit step cap, degraded answer | 13.4s, recovered from 3 API errors within a single turn, produced diagnostic response |

Haiku 4.5 alone — ~3× cheaper and ~2.6× faster than Sonnet 4.6 — handles 100% of normal chat turns including in-turn error recovery. Sonnet 4.6 becomes the reserve model for continuation turns (post-approval write execution, chat recovery after DO restart).

## Decision

Adopt a **hybrid architecture**:

- **Next.js UI stays on Vercel.** OAuth install flow, JWT sessions, iframe shell, App Extensions registration, IndexedDB chat history, BigDesign component library, and routing all stay as-is. No migration risk to the BC app framework integration.
- **Agent runtime moves to a new Cloudflare Worker** at `workers/agent-runtime/`, built on `@cloudflare/think` as the agent base class and `@cloudflare/codemode` as the execution substrate. Per-store Durable Objects hold conversation state and proxy BC API credentials.
- **Model strategy: Haiku 4.5 by default, Sonnet 4.6 on continuation turns.** Wired via Think's `beforeTurn` hook. Haiku carries the read path; Sonnet guards the write path (Phase 3) and handles chat recovery.
- **Credentials never touch generated code.** The host worker holds the BC access token, exposes typed tools, and the sandbox only sees `codemode.*` RPC calls that proxy back to the host. Architecturally identical to Agent Lee's Durable Object credential proxy.
- **Next.js `/api/chat` becomes a proxy** to the Worker's agent endpoint via SSE or WebSocket. The UI receives structured block streams (text + components + approval requests) and renders them inline.

## Consequences

**Positive:**
- Compound queries collapse from N serial tool calls to one code execution. Latency wins on hard questions, quality wins via in-memory joins.
- Error recovery is architectural: when one generated script fails, the model sees the error in context and pivots strategy without burning the step budget.
- Credential isolation matches the Agent Lee security model. Generated code runs in an isolate with `globalOutbound: null` — no way to exfiltrate tokens even if the model is prompted adversarially.
- Zero idle cost. Durable Objects hibernate when inactive; one agent per merchant scales cleanly to arbitrary merchant count.
- Generative UI (Phase 2) gets a clean hook point: sandbox code can return structured blocks instead of just text, and the Next.js renderer mounts real React components inline.
- Demo positioning: "Ask BC uses the same substrate Cloudflare uses for Agent Lee" is a stronger story than "we rebuilt Agent Lee on Vercel Sandbox."

**Negative:**
- `@cloudflare/think` and `@cloudflare/codemode` are experimental preview (0.2.x / 0.3.x). API changes are possible. Mitigation: pin exact versions, track upstream changes, fall back to raw `agents` SDK + manual `@cloudflare/codemode` integration if Think becomes too rough.
- Two deployment targets to manage — Vercel for the UI, Cloudflare for the runtime. Two sets of secrets, two CI pipelines, two observability dashboards. Mitigation: keep the proxy boundary thin and well-defined; the UI treats the Worker as a black-box agent endpoint.
- Learning curve on Cloudflare primitives (Durable Objects, Dynamic Workers, `experimental` compat flag, `worker_loaders` binding, partyserver lifecycle). Some real gotchas surfaced during Phase 0 (see `docs/developer/agent-runtime.md#known-gotchas`).
- The hybrid topology requires a reliable stream protocol between Next.js and the Worker. SSE is simpler; WebSocket is what Think's top-level protocol uses natively. We'll pick in Phase 2.

**Neutral:**
- Anthropic API usage moves from the Vercel side to the Cloudflare Worker. Key rotation and cost attribution change teams, not totals.
- The existing 15 hand-written BC tools get replaced in Phase 1 by an OpenAPI-generated typed client + ~20 `tool()` definitions on the Worker side. Most of the business logic (Zod schemas, parameter validation, pagination heuristics) ports over directly.

## Alternatives Considered

### Alternative 1: Stay on Vercel, use Vercel Sandbox for Codemode

- **Description:** Keep everything on Vercel. Use Vercel Sandbox (ephemeral Firecracker microVMs) as the Codemode executor. Write our own lightweight codemode-style runtime from scratch — TypeScript code string → compile → execute in a sandbox with a credentialed proxy injected as `globalThis.bc`.
- **Pros:** No platform migration. Single CI/CD pipeline. Familiar Next.js + Vercel AI SDK stack. Vercel Sandbox is production-ready, not experimental preview.
- **Cons:** Vercel Sandbox cold-start latency is 200–800ms versus <10ms for Dynamic Workers — measurable in the demo feel. We rebuild Project Think's durable session, workspace filesystem, agentic loop, streaming, and sub-agent RPC from scratch (estimated 2–3 days of scaffolding Cloudflare gives us as a library). No per-agent Durable Object identity — state must live in Redis/IndexedDB, which is functional but architecturally less clean. Cost per request is higher because every cold start re-provisions. Demo story is weaker: "we built an Agent-Lee-like thing on a different stack" instead of "we used the same substrate."

### Alternative 2: Full Cloudflare migration (Pages + Workers for the UI too)

- **Description:** Port the Next.js UI to Cloudflare Pages. Everything runs on Cloudflare — UI, agent runtime, Durable Objects, Workers AI or Anthropic via outbound fetch.
- **Pros:** Single platform, single bill, single dashboard. The fullest "all-Cloudflare" story. No hybrid proxy layer.
- **Cons:** BC OAuth callbacks, partitioned iframe cookies, JWT session handling (`jose`), BigDesign styled-components, and App Extension GraphQL registration all need to be revalidated on Cloudflare Pages. The BC admin iframe context has real CSP constraints that took work to get right on Vercel and could regress on a new host. Estimated 3–5 days of rework on functionality that already works in production, with zero demo value. Scope creep risk is high — the agent runtime migration expands into a full UI migration.

### Alternative 3: Lighter refactor — plan executor meta-tool on the existing Vercel stack

- **Description:** Keep the tool loop, but add one meta-tool `execute_plan` that takes an array of `{tool, args}` objects and runs them in parallel server-side. The model plans the whole query graph in one tool call instead of chaining calls serially.
- **Pros:** Minimal code change. No platform migration. 80% of the latency win for the compound-query case without a sandbox.
- **Cons:** Still no true code generation — the model emits structured plans, not TypeScript. No in-memory aggregation inside the plan (the host has to aggregate after). No generative UI hook point. No write approval gate. No credential isolation. The demo story becomes "we batched tool calls," not "we have Codemode." Doesn't close the architectural gap to Agent Lee; just narrows it on one axis.

## References

- [Introducing Agent Lee](https://blog.cloudflare.com/introducing-agent-lee/) — Cloudflare, the product we're benchmarking against
- [Project Think](https://blog.cloudflare.com/project-think/) — Cloudflare's open agent framework, the libraries we're adopting
- [Dynamic Workers](https://blog.cloudflare.com/dynamic-workers/) — the sandbox execution primitive
- [`@cloudflare/think`](https://www.npmjs.com/package/@cloudflare/think) — opinionated agent base class
- [`@cloudflare/codemode`](https://www.npmjs.com/package/@cloudflare/codemode) — Code Mode runtime
- `docs/developer/agent-runtime.md` — operational guide for the Worker
- `workers/agent-runtime/src/index.ts` — Phase 0 scaffold
