import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { getStoreCredentials } from '@/lib/store-credentials';

const JWT_ALG = 'HS256';
const SESSION_COOKIE = 'session-token';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function getJwtSecret() {
  return new TextEncoder().encode(env.JWT_KEY);
}

function getBcSecret() {
  return new TextEncoder().encode(env.BIGCOMMERCE_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// BigCommerce signed_payload_jwt verification
// ---------------------------------------------------------------------------

export interface BcJwtPayload {
  iss: string;
  sub: string;
  user: { id: number; email: string };
  owner: { id: number; email: string };
  url: string;
  channel_id: number | null;
}

export async function verifyBcJwt(signedPayloadJwt: string): Promise<BcJwtPayload> {
  const { payload } = await jwtVerify(signedPayloadJwt, getBcSecret(), {
    algorithms: [JWT_ALG],
  });
  return payload as unknown as BcJwtPayload;
}

// ---------------------------------------------------------------------------
// Internal session JWT
// ---------------------------------------------------------------------------

export interface SessionPayload {
  userId: number;
  email: string;
  storeHash: string;
  channelId: number | null;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: [JWT_ALG],
  });
  return payload as unknown as SessionPayload;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export async function getSessionCookie(storeHash: string): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

// ---------------------------------------------------------------------------
// OAuth: exchange temporary code for access token
// ---------------------------------------------------------------------------

interface OAuthTokenResponse {
  access_token: string;
  scope: string;
  user: { id: number; email: string; username: string };
  account_uuid: string;
  context: string;
}

export async function exchangeCodeForToken(
  code: string,
  context: string,
  scope: string,
): Promise<OAuthTokenResponse> {
  const response = await fetch(`${env.BIGCOMMERCE_LOGIN_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.BIGCOMMERCE_CLIENT_ID,
      client_secret: env.BIGCOMMERCE_CLIENT_SECRET,
      code,
      context,
      scope,
      grant_type: 'authorization_code',
      redirect_uri: `${env.APP_ORIGIN}/api/auth`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Authorize: verify session + retrieve access token from Redis
// ---------------------------------------------------------------------------

export async function authorize(storeHash: string) {
  const token = await getSessionCookie(storeHash);
  if (!token) {
    throw new Error('No session token');
  }

  const session = await verifySessionToken(token);

  const store = await getStoreCredentials(session.storeHash);

  if (!store) {
    if (process.env.NODE_ENV === 'development') {
      return {
        ...session,
        accessToken: 'dev-access-token',
        scope: 'store_v2_default',
      };
    }
    throw new Error('Store not found');
  }

  return {
    ...session,
    accessToken: store.accessToken,
    scope: store.scope,
  };
}
