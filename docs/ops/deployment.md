# Deployment Procedures

> Last updated: 2026-04-15

Ask BC has two deployment targets that must both be operational for chat to work:

1. **Vercel** — Next.js app (OAuth, iframe shell, App Extensions, generative UI)
2. **Cloudflare Worker** — Agent runtime (chat, BC API tools, write operations)

Both targets share two secrets (`JWT_KEY`, `CREDENTIAL_ENCRYPTION_KEY`) that must be identical. Rotate them together.

---

## Vercel Deployment

### First-Time Setup

1. Import the `Signal-x-Studio-LLC/ask-bc` repository to Vercel at [vercel.com/new](https://vercel.com/new)
2. Connect the [Upstash (Vercel KV)](https://vercel.com/integrations/upstash) integration — this auto-populates `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`
3. Set the remaining environment variables in Vercel project settings:

| Variable | Value |
|----------|-------|
| `BIGCOMMERCE_CLIENT_ID` | From BC Developer Portal |
| `BIGCOMMERCE_CLIENT_SECRET` | From BC Developer Portal |
| `APP_ORIGIN` | Your Vercel deployment URL (e.g., `https://ask-bc-signal-x-studio-labs.vercel.app`) — no trailing slash |
| `JWT_KEY` | `openssl rand -hex 32` — save this value, it must match the Worker |
| `CREDENTIAL_ENCRYPTION_KEY` | `openssl rand -hex 32` — save this value, it must match the Worker |
| `ANTHROPIC_API_KEY` | From Anthropic Console |
| `NEXT_PUBLIC_WORKER_HOST` | Worker URL — set after deploying the Worker (see below) |

4. Set the build command to `npm run build` and the output directory to `.next`
5. Deploy — Vercel will detect Next.js automatically

### Ongoing Deployments

Push to `main` triggers an automatic deployment. No manual action required. Vercel builds, runs type checking, and promotes to production automatically.

**Check deploy status:**
- Vercel dashboard → Deployments
- Or: `vercel ls` (Vercel CLI)

### BC App Callback URLs

In the [BC Developer Portal](https://devtools.bigcommerce.com/my/apps), set:

| Callback | URL |
|----------|-----|
| Auth | `https://ask-bc-signal-x-studio-labs.vercel.app/api/auth` |
| Load | `https://ask-bc-signal-x-studio-labs.vercel.app/api/load` |
| Uninstall | `https://ask-bc-signal-x-studio-labs.vercel.app/api/uninstall` |
| Remove User | `https://ask-bc-signal-x-studio-labs.vercel.app/api/remove-user` |

---

## Cloudflare Worker Deployment

### Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### First-Time Deployment

```bash
cd workers/agent-runtime
npm install
npx wrangler deploy
```

Wrangler runs the TypeScript build, uploads the Worker, and creates the Durable Object namespace with SQLite storage (via the `migrations` entry in `wrangler.jsonc`).

After the first deploy, set all 5 secrets:

```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste value at prompt

wrangler secret put UPSTASH_REDIS_REST_URL
# Paste the same URL as Vercel's KV_REST_API_URL

wrangler secret put UPSTASH_REDIS_REST_TOKEN
# Paste the same token as Vercel's KV_REST_API_TOKEN

wrangler secret put CREDENTIAL_ENCRYPTION_KEY
# Paste the same value you set on Vercel

wrangler secret put JWT_KEY
# Paste the same value you set on Vercel
```

Verify the deployment:

```bash
curl https://ask-bc-agent-runtime.biq.workers.dev/health
# {"ok":true,"service":"ask-bc-agent-runtime"}
```

### Wiring Vercel to the Worker

Set `NEXT_PUBLIC_WORKER_HOST=https://ask-bc-agent-runtime.biq.workers.dev` in Vercel project settings. Redeploy Vercel (or trigger via `vercel --prod`) so the Next.js build picks up the new env var (it's a `NEXT_PUBLIC_` var, baked at build time).

### Ongoing Deployments

Worker deployments are **manual** — there is no CI/CD configured.

```bash
cd workers/agent-runtime
npx wrangler deploy
```

Wrangler deploys to production immediately. There is no staging slot. Test locally with `npx wrangler dev` before deploying.

**Check Worker version:**

```bash
wrangler deployments list
```

### Deployment Checklist

Before deploying the Worker:

- [ ] `cd workers/agent-runtime && npx tsc --noEmit` passes with no errors
- [ ] `npx wrangler dev` starts without errors
- [ ] `/smoke` returns a valid response against real BC data (if credentials are configured in `.dev.vars`)
- [ ] No new secrets added without also setting them via `wrangler secret put`
- [ ] If `wrangler.jsonc` `vars` section changed, verify the change is intentional (vars are visible in the Cloudflare dashboard)

After deploying:

- [ ] `curl https://ask-bc-agent-runtime.biq.workers.dev/health` returns `{"ok":true,...}`
- [ ] Load the BC admin app and verify a chat turn completes (look for block components rendering)

---

## Secret Rotation

### Rotating `JWT_KEY`

1. Generate a new key: `openssl rand -hex 32`
2. Update on Vercel: Project Settings → Environment Variables → `JWT_KEY`
3. Update on Worker: `wrangler secret put JWT_KEY`
4. Trigger a Vercel redeploy (to pick up the new env var in the Edge Middleware)
5. **Impact:** All existing merchant sessions are invalidated. Merchants get a "session expired" or blank redirect on next page load. They re-auth by reloading the BC admin — BC will re-POST to the Load callback which issues a new JWT.

### Rotating `CREDENTIAL_ENCRYPTION_KEY`

This is the most impactful rotation because stored tokens in Redis are encrypted with the old key.

1. Generate a new key: `openssl rand -hex 32`
2. Decide on strategy:
   - **Force reinstall:** Set the new key on Vercel and Worker. All merchants get a "credentials error" on next turn. They reinstall the app, which triggers a new OAuth flow, re-encrypts with the new key, and restores access. This is the safest approach.
   - **Migration script:** Read all `ask-bc:store:*` keys, decrypt with the old key, re-encrypt with the new key, write back. Not implemented — requires careful coordination.
3. Update on Vercel: Project Settings → `CREDENTIAL_ENCRYPTION_KEY`
4. Update on Worker: `wrangler secret put CREDENTIAL_ENCRYPTION_KEY`
5. Trigger a Vercel redeploy

### Rotating `ANTHROPIC_API_KEY`

1. Generate or copy the new key from the Anthropic Console
2. Update on Vercel: Project Settings → `ANTHROPIC_API_KEY`
3. Update on Worker: `wrangler secret put ANTHROPIC_API_KEY`
4. No service interruption — the new key takes effect on the next API call

### Rotating `UPSTASH_REDIS_REST_TOKEN`

1. Rotate in the Upstash dashboard
2. Update on Vercel: `KV_REST_API_TOKEN` (and `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` if the integration doesn't update them)
3. Update on Worker: `wrangler secret put UPSTASH_REDIS_REST_TOKEN`
4. Brief window where credential reads fail if rotation is not coordinated — deploy Worker first, then update Vercel

---

## Environment Variable Reference

### Vercel (12 vars)

| Variable | Required | Rotatable | Notes |
|----------|----------|-----------|-------|
| `ANTHROPIC_API_KEY` | Yes | Yes | Used by legacy Vercel chat route |
| `APP_ORIGIN` | Yes | No | Changes when domain changes |
| `BIGCOMMERCE_CLIENT_ID` | Yes | No | Tied to BC app registration |
| `BIGCOMMERCE_CLIENT_SECRET` | Yes | Yes | Rotate in BC Dev Portal |
| `JWT_KEY` | Yes | Yes | Must match Worker |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | Yes | Must match Worker — see rotation notes |
| `NEXT_PUBLIC_WORKER_HOST` | Yes | No | Changes if Worker is renamed or migrated |
| `KV_REST_API_URL` | Yes | No | Auto-set by Vercel KV integration |
| `KV_REST_API_TOKEN` | Yes | Yes | Rotate via Upstash dashboard |
| `KV_REST_API_READ_ONLY_TOKEN` | No | Yes | Provided by integration |
| `KV_URL` | No | No | Provided by integration |
| `REDIS_URL` | No | No | Provided by integration |

### Worker (5 secrets + 2 vars)

| Name | Type | Rotatable | Notes |
|------|------|-----------|-------|
| `ANTHROPIC_API_KEY` | Secret | Yes | Independent of Vercel |
| `UPSTASH_REDIS_REST_URL` | Secret | No | Same instance as Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Yes | Same token as Vercel |
| `CREDENTIAL_ENCRYPTION_KEY` | Secret | Yes | Must match Vercel |
| `JWT_KEY` | Secret | Yes | Must match Vercel |
| `BC_API_BASE` | Var | No | `https://api.bigcommerce.com` — set in `wrangler.jsonc` |
| `APP_ORIGIN` | Var | No | Vercel URL — set in `wrangler.jsonc` |
