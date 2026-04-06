import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/bigcommerce/auth';
import { saveStoreCredentials } from '@/lib/store-credentials';

/**
 * GET /dev/session/[storeHash]
 *
 * Development-only route that creates a valid session cookie,
 * bypassing BigCommerce OAuth entirely.
 *
 * Visit http://localhost:3000/dev/session/dev-store
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const { storeHash } = await params;

  await saveStoreCredentials({
    storeHash,
    accessToken: 'dev-access-token',
    scope: 'store_v2_default',
    adminId: 1,
  });

  const token = await createSessionToken({
    userId: 1,
    email: 'dev@localhost',
    storeHash,
    channelId: 1,
  });

  const response = NextResponse.redirect(new URL(`/stores/${storeHash}`, _request.url));

  response.cookies.set('session-token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: `/stores/${storeHash}`,
    maxAge: 60 * 60 * 24,
  });

  return response;
}
