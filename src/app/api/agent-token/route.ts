import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { verifySessionToken, getSessionCookie } from '@/lib/bigcommerce/auth';
import { env } from '@/lib/env';

/**
 * GET /api/agent-token?storeHash=xxx
 *
 * Mints a short-lived JWT for the Worker WebSocket connection.
 * Reads the session cookie, verifies it, extracts storeHash,
 * and returns a 60-second token the client passes as ?token=
 * on the WebSocket URL.
 *
 * This is the OAuth-to-Worker handoff — the bridge between
 * Vercel's session auth and the Worker's JWT auth gate.
 */
export async function GET(request: NextRequest) {
  const storeHash = request.nextUrl.searchParams.get('storeHash');
  if (!storeHash) {
    return NextResponse.json({ error: 'storeHash required' }, { status: 400 });
  }

  const sessionToken = await getSessionCookie(storeHash);
  if (!sessionToken) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  try {
    const session = await verifySessionToken(sessionToken);

    if (session.storeHash !== storeHash) {
      return NextResponse.json({ error: 'Store mismatch' }, { status: 403 });
    }

    // Mint a short-lived token for the Worker (60 seconds — just
    // needs to survive the WebSocket upgrade handshake)
    const secret = new TextEncoder().encode(env.JWT_KEY);
    const agentToken = await new SignJWT({ storeHash: session.storeHash })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(secret);

    return NextResponse.json({ token: agentToken });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
