import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

/**
 * Middleware handles the BigCommerce "load" callback.
 *
 * When a merchant opens the app in the BC control panel, BigCommerce sends
 * a GET to /api/load?signed_payload_jwt=... — we verify the JWT, create
 * an internal session cookie, and redirect to /stores/{storeHash}.
 */
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

    const response = NextResponse.redirect(new URL(`/stores/${storeHash}`, appOrigin));

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
    console.error('Load callback failed:', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 401 });
  }
}

export const config = {
  matcher: '/api/load',
};
