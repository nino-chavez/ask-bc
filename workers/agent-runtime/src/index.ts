import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { routeAgentRequest } from "agents";
import { createAnthropic } from "@ai-sdk/anthropic";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";

interface Env {
  ASK_BC: DurableObjectNamespace;
  LOADER: WorkerLoader;
  ANTHROPIC_API_KEY: string;
  BC_STORE_HASH: string;
  BC_ACCESS_TOKEN: string;
  BC_API_BASE: string;
}

// ─── BC API helpers ────────────────────────────────────────────────
// The host holds credentials. Sandbox code calls these via codemode.* RPC —
// credentials never appear in generated code.

function bcHeaders(env: Env): HeadersInit {
  return {
    "X-Auth-Token": env.BC_ACCESS_TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function bcUrl(env: Env, path: string, version: "v2" | "v3" = "v3"): string {
  const base = env.BC_API_BASE.replace(/\/$/, "");
  return `${base}/stores/${env.BC_STORE_HASH}/${version}${path}`;
}

async function bcGet(env: Env, path: string, version: "v2" | "v3" = "v3") {
  const res = await fetch(bcUrl(env, path, version), {
    headers: bcHeaders(env),
  });
  if (!res.ok) {
    throw new Error(`BC ${version} GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ─── BC tools (Phase 0: minimum viable surface) ────────────────────
// Phase 1 will generate these from the BC OpenAPI spec. For now, four
// hand-written tools are enough to prove the codemode loop works.

function buildBcTools(env: Env) {
  return {
    getProducts: tool({
      description:
        "Fetch products from the BigCommerce store. Returns an array of products with id, name, price, inventory_level, categories, etc.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50).describe("Max products to return (1-250)"),
        page: z.number().int().min(1).default(1),
        sort: z.enum(["name", "date_created", "total_sold", "inventory_level"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
      }),
      execute: async ({ limit, page, sort, direction }) => {
        const params = new URLSearchParams({ limit: String(limit), page: String(page) });
        if (sort) params.set("sort", sort);
        if (direction) params.set("direction", direction);
        return bcGet(env, `/catalog/products?${params}`);
      },
    }),

    getOrders: tool({
      description:
        "Fetch orders from the BigCommerce store. Returns orders with id, status, total_inc_tax, customer_id, date_created, etc. Uses V2 API.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        status_id: z.number().int().optional().describe("Filter by status id (e.g. 11=Awaiting Fulfillment)"),
        min_date_created: z.string().optional().describe("ISO date, inclusive lower bound"),
      }),
      execute: async ({ limit, page, status_id, min_date_created }) => {
        const params = new URLSearchParams({ limit: String(limit), page: String(page) });
        if (status_id !== undefined) params.set("status_id", String(status_id));
        if (min_date_created) params.set("min_date_created", min_date_created);
        return bcGet(env, `/orders?${params}`, "v2");
      },
    }),

    getCustomers: tool({
      description:
        "Fetch customers from the BigCommerce store. Returns customers with id, email, first_name, last_name, date_created, etc.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      }),
      execute: async ({ limit, page }) => {
        const params = new URLSearchParams({ limit: String(limit), page: String(page) });
        return bcGet(env, `/customers?${params}`);
      },
    }),

    getStoreInfo: tool({
      description: "Fetch store metadata: name, domain, currency, timezone, plan, etc.",
      inputSchema: z.object({}),
      execute: async () => bcGet(env, "/store", "v2"),
    }),
  };
}

// ─── System prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Ask BC, an AI assistant for BigCommerce merchants.

You have ONE tool: \`execute\`. It runs TypeScript you write in an isolated sandbox.
Inside the sandbox you have typed \`codemode.*\` functions that proxy to real BC APIs.

RULES:
1. ALWAYS use codemode to fetch real store data. Never guess or fabricate.
2. For multi-step questions, write ONE script that chains calls — do not make multiple execute calls back-to-back.
3. Return results via \`return\` at the end of your script. The return value will be shown to the merchant.
4. The sandbox has no outbound network access except via codemode.* — don't try fetch(), it will throw.
5. Keep scripts focused: fetch what you need, aggregate in memory, return a structured result.

Example — "What are my top products by inventory?":
\`\`\`ts
const { data: products } = await codemode.getProducts({ limit: 100, sort: "inventory_level", direction: "desc" });
return products.slice(0, 10).map(p => ({
  name: p.name,
  inventory: p.inventory_level,
  price: p.price,
}));
\`\`\`

Be concise. Merchants want answers, not explanations of your process.`;

// ─── The Agent ─────────────────────────────────────────────────────

export class AskBC extends Think<Env> {
  // Phase 0 smoke state: captures the last turn's final result so the /smoke
  // HTTP endpoint can return it synchronously. Real chat uses WebSocket streaming.
  _lastSmokeResult: { text: string; toolCalls: unknown[] } | null = null;
  _lastSmokeResolver: (() => void) | null = null;
  _lastModelUsed: string[] = [];

  /**
   * Default model: Haiku 4.5 — ~2.6× faster and ~3× cheaper than Sonnet 4.6,
   * handles 95% of real merchant questions on the first try. See beforeTurn()
   * for the auto-upgrade to Sonnet on continuation turns.
   */
  getModel() {
    const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    return anthropic("claude-haiku-4-5-20251001");
  }

  /**
   * Two-model strategy: Haiku by default, Sonnet 4.6 on continuation turns.
   * A "continuation" is anything after the first step in a turn — most
   * importantly, retries after a tool error. That's exactly where Sonnet's
   * deeper reasoning and error-recovery instincts earn their extra cost.
   */
  beforeTurn(ctx: { continuation: boolean }): { model: LanguageModel } | void {
    if (ctx.continuation) {
      const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
      this._lastModelUsed.push("sonnet-4-6");
      return { model: anthropic("claude-sonnet-4-6") };
    }
    this._lastModelUsed.push("haiku-4-5");
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  getTools() {
    return {
      execute: createExecuteTool({
        tools: buildBcTools(this.env),
        loader: this.env.LOADER,
        timeout: 30_000,
        // globalOutbound defaults to null — sandbox is fully isolated,
        // only codemode.* RPC calls escape to the host.
      }),
    };
  }

  // Capture final assistant text when saveMessages() finishes a turn.
  onChatResponse(result: {
    message: { parts?: Array<{ type: string; text?: string }> };
    status: string;
    error?: string;
  }) {
    const textParts =
      result.message.parts?.filter((p) => p.type === "text").map((p) => p.text ?? "") ?? [];
    this._lastSmokeResult = {
      text: result.status === "error" ? `ERROR: ${result.error}` : textParts.join(""),
      toolCalls: result.message.parts?.filter((p) => p.type !== "text") ?? [],
    };
    this._lastSmokeResolver?.();
    this._lastSmokeResolver = null;
  }

  onChatError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    this._lastSmokeResult = { text: `ERROR: ${msg}`, toolCalls: [] };
    this._lastSmokeResolver?.();
    this._lastSmokeResolver = null;
    return error;
  }

  /**
   * Phase 0 smoke-test helper. Clears history, injects a user message, waits
   * for the turn to complete via onChatResponse, returns the final text.
   */
  async smokeAsk(message: string, timeoutMs = 60_000): Promise<{
    text: string;
    toolCalls: unknown[];
    modelsUsed: string[];
    timedOut: boolean;
  }> {
    // Native DO RPC bypasses the standard entry paths (fetch/alarm/ws)
    // where partyserver lazy-runs onStart(), so session / workspace are
    // still undefined. This escape hatch exists for exactly this case.
    await (this as unknown as { __unsafe_ensureInitialized(): Promise<void> })
      .__unsafe_ensureInitialized();

    this.clearMessages();
    this._lastSmokeResult = null;
    this._lastModelUsed = [];

    const done = new Promise<void>((resolve) => {
      this._lastSmokeResolver = resolve;
    });

    await this.saveMessages([
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: message }],
      } as never,
    ]);

    let timedOut = false;
    await Promise.race([
      done,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs),
      ),
    ]);

    const captured = this._lastSmokeResult as
      | { text: string; toolCalls: unknown[] }
      | null;
    return {
      text: captured?.text ?? "",
      toolCalls: captured?.toolCalls ?? [],
      modelsUsed: [...this._lastModelUsed],
      timedOut,
    };
  }
}

// ─── Worker entry ──────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "ask-bc-agent-runtime",
          store: env.BC_STORE_HASH || "(not set)",
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    // Phase 0 smoke test: POST /smoke {message} → one chat turn, returns
    // final text + event trace. Synchronous, curl-friendly.
    if (url.pathname === "/smoke" && request.method === "POST") {
      const body = (await request.json()) as { message?: string };
      if (!body.message) {
        return new Response(JSON.stringify({ error: "message required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const id = env.ASK_BC.idFromName(env.BC_STORE_HASH);
      const stub = env.ASK_BC.get(id) as unknown as AskBC & {
        setName(name: string): Promise<void>;
      };
      // Known DO/partyserver quirk: .name must be set explicitly when
      // bypassing routePartyKitRequest (cloudflare/workerd#2240).
      await stub.setName(env.BC_STORE_HASH);
      const result = await stub.smokeAsk(body.message);

      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Delegate real chat routes to the agents framework (handles WebSocket +
    // /agents/:namespace/:room protocol automatically).
    const response = await routeAgentRequest(request, env);
    return response ?? new Response("Not found", { status: 404 });
  },
};
