import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, createSessionToken } from '@/lib/bigcommerce/auth';
import { saveStoreCredentials, saveStoreUser } from '@/lib/store-credentials';
import { env } from '@/lib/env';

/**
 * GET /api/auth
 *
 * BigCommerce OAuth install callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const scope = searchParams.get('scope');
  const context = searchParams.get('context');

  if (!code || !scope || !context) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const storeHash = context.replace('stores/', '');

  try {
    const tokenData = await exchangeCodeForToken(code, context, scope);

    await saveStoreCredentials({
      storeHash,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      adminId: tokenData.user.id,
    });

    await saveStoreUser(storeHash, tokenData.user.id, tokenData.user.email, true);

    const sessionToken = await createSessionToken({
      userId: tokenData.user.id,
      email: tokenData.user.email,
      storeHash,
      channelId: null,
    });

    const response = NextResponse.redirect(
      new URL(`/stores/${storeHash}`, env.APP_ORIGIN),
    );

    response.cookies.set('session-token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: `/stores/${storeHash}`,
      maxAge: 60 * 60 * 24,
      partitioned: true,
    });

    return response;
  } catch (error) {
    console.error('OAuth auth failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Authentication failed', detail: message },
      { status: 500 },
    );
  }
}
