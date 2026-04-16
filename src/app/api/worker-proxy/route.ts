import { NextRequest, NextResponse } from 'next/server';

/**
 * Thin proxy from the Next.js app to the Cloudflare Worker agent runtime.
 *
 * Dev only. POST { message } → forwards to the Worker's /smoke endpoint
 * and returns the JSON verbatim. No auth, no store hash wrangling — the
 * Worker is configured with its own BC credentials via wrangler secrets.
 *
 * Wire the Worker URL via WORKER_AGENT_URL env var. Defaults to the
 * local wrangler dev server at http://localhost:8787.
 *
 * TODO(phase-2c): replace with a streaming WebSocket relay once the
 * Worker exposes the full agents protocol and we want token-by-token
 * streaming in the chat UI.
 */

const WORKER_URL = process.env.WORKER_AGENT_URL ?? 'http://localhost:8787';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  if (!body?.message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${WORKER_URL}/smoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: body.message }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Worker returned ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as unknown;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to reach worker',
        detail: err instanceof Error ? err.message : String(err),
        hint: `Is wrangler dev running at ${WORKER_URL}?`,
      },
      { status: 502 },
    );
  }
}
