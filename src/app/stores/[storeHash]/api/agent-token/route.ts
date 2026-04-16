import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { verifySessionToken, getSessionCookie } from '@/lib/bigcommerce/auth';
import { env } from '@/lib/env';

/**
 * GET /stores/[storeHash]/api/agent-token
 *
 * Mints a short-lived JWT for the Worker WebSocket connection.
 * Under the /stores/[storeHash]/ path so the session cookie
 * (scoped to that path) is included in the request.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  const sessionToken = await getSessionCookie(storeHash);
  if (!sessionToken) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  try {
    const session = await verifySessionToken(sessionToken);

    if (session.storeHash !== storeHash) {
      return NextResponse.json({ error: 'Store mismatch' }, { status: 403 });
    }

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
