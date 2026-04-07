import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname !== '/api/load') {
    return NextResponse.next();
  }

  const signedPayloadJwt = searchParams.get('signed_payload_jwt');
  if (!signedPayloadJwt) {
    return NextResponse.json({ error: 'Missing signed_payload_jwt' }, { status: 400 });
  }

  const clientSecret = process.env.BIGCOMMERCE_CLIENT_SECRET;
  const jwtKey = process.env.JWT_KEY;
  const appOrigin = process.env.APP_ORIGIN;

  if (!clientSecret || !jwtKey || !appOrigin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const { payload } = await jwtVerify(
      signedPayloadJwt,
      new TextEncoder().encode(clientSecret),
      { algorithms: ['HS256'] },
    );

    const storeHash = (payload.sub as string).replace('stores/', '');
    const user = payload.user as { id: number; email: string };
    const channelId = (payload.channel_id as number) ?? null;

    const sessionToken = await new SignJWT({
      userId: user.id,
      email: user.email,
      storeHash,
      channelId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(new TextEncoder().encode(jwtKey));

    // Determine redirect path:
    // For App Extension loads, the JWT `url` field contains the extension path
    // with ${id} already substituted by BigCommerce.
    // Normal loads have url like "https://store-xxx.mybigcommerce.com"
    let redirectPath = `/stores/${storeHash}`;
    const jwtUrl = payload.url as string | undefined;

    if (jwtUrl && !jwtUrl.startsWith('http') && jwtUrl.includes('/extensions/')) {
      redirectPath = jwtUrl;
    }

    // Also check all payload keys for any extension-related data
    // and pass the full payload as a debug cookie (temporary)
    const response = NextResponse.redirect(new URL(redirectPath, appOrigin));

    response.cookies.set('session-token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: `/stores/${storeHash}`,
      maxAge: 60 * 60 * 24,
      partitioned: true,
    });

    // Debug: store the payload keys in a cookie we can inspect
    const payloadKeys = Object.keys(payload).join(',');
    response.cookies.set('debug-payload-keys', payloadKeys, {
      path: `/stores/${storeHash}`,
      maxAge: 60,
    });
    // Store the url field specifically
    response.cookies.set('debug-payload-url', String(jwtUrl || 'none'), {
      path: `/stores/${storeHash}`,
      maxAge: 60,
    });

    return response;
  } catch (error) {
    console.error('Load callback failed:', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 401 });
  }
}

export const config = {
  matcher: '/api/load',
};
