import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, createSessionToken } from '@/lib/bigcommerce/auth';
import { saveStoreCredentials, saveStoreUser } from '@/lib/store-credentials';
import { registerAppExtensions } from '@/lib/bigcommerce/app-extensions';
import { env } from '@/lib/env';

// Scopes this app actually needs. If an install returns scopes outside
// this set — especially store_v2_default (wildcard) — we log loudly so
// the operator can tighten the BC devtools app manifest.
const EXPECTED_SCOPES = new Set([
  'store_v2_customers',
  'store_v2_information',
  'store_v2_marketing',
  'store_v2_orders',
  'store_v2_products',
  'store_v2_content_read_only',
]);

function validateInstallScope(scopeString: string): { unexpected: string[]; wildcard: boolean } {
  const granted = scopeString.split(/\s+/).filter(Boolean);
  const wildcard = granted.includes('store_v2_default');
  const unexpected = granted.filter((s) => s !== 'store_v2_default' && !EXPECTED_SCOPES.has(s));
  return { unexpected, wildcard };
}

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

    const { unexpected, wildcard } = validateInstallScope(tokenData.scope);
    if (wildcard) {
      console.warn(
        `[auth] Store ${storeHash} installed with store_v2_default (wildcard scope). ` +
          `Reduce the scope in the BC developer portal to least-privilege.`,
      );
    }
    if (unexpected.length) {
      console.warn(
        `[auth] Store ${storeHash} install granted unexpected scopes: ${unexpected.join(', ')}. ` +
          `Update EXPECTED_SCOPES or tighten the app manifest.`,
      );
    }

    await saveStoreCredentials({
      storeHash,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      adminId: tokenData.user.id,
    });

    await saveStoreUser(storeHash, tokenData.user.id, tokenData.user.email, true);

    // Register App Extensions (non-blocking — don't fail install if this errors)
    registerAppExtensions(storeHash, tokenData.access_token, env.APP_ORIGIN).catch(
      (err) => console.error('Failed to register app extensions:', err),
    );

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
