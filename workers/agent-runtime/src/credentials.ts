import { Redis } from "@upstash/redis/cloudflare";

/**
 * Per-store credential resolution from the shared Upstash Redis instance.
 *
 * The Next.js OAuth install flow writes `ask-bc:store:{hash}` → JSON
 * with {storeHash, accessToken, scope, adminId} to Redis. This module
 * reads and optionally decrypts those credentials in the Worker.
 *
 * For dev/testing, falls back to env vars BC_STORE_HASH + BC_ACCESS_TOKEN
 * if Redis is not configured.
 */

export interface StoreCredentials {
  storeHash: string;
  accessToken: string;
  scope: string;
  adminId: number;
}

interface CredentialEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  BC_STORE_HASH?: string;
  BC_ACCESS_TOKEN?: string;
  // When "true", enables the single-store env-var fallback below. Must be
  // explicitly set. Prevents accidental prod use of BC_STORE_HASH /
  // BC_ACCESS_TOKEN if they're ever configured as secrets.
  DEV_MODE?: string;
  APP_ORIGIN?: string;
}

const STORE_KEY_PREFIX = "ask-bc:store:";

/**
 * AES-256-GCM encryption for BC access tokens at rest in Redis. [S-7]
 *
 * The encryption key is shared between the Vercel app (which writes
 * encrypted tokens during OAuth) and the Worker (which reads them).
 */
async function decrypt(
  encryptedJson: string,
  keyHex: string,
): Promise<string> {
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson) as {
    iv: string;
    ciphertext: string;
    tag: string;
  };

  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"],
  );

  const ivBytes = base64ToBytes(iv);
  const ctBytes = base64ToBytes(ciphertext);
  const tagBytes = base64ToBytes(tag);

  // Concatenate ciphertext + tag for WebCrypto AES-GCM
  const combined = new Uint8Array(ctBytes.length + tagBytes.length);
  combined.set(ctBytes);
  combined.set(tagBytes, ctBytes.length);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    combined,
  );

  return new TextDecoder().decode(plaintext);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Resolve credentials for a store hash.
 *
 * Priority:
 * 1. Upstash Redis (production + multi-tenant)
 * 2. Env vars BC_STORE_HASH + BC_ACCESS_TOKEN (dev fallback)
 * 3. Throws if neither is available
 */
export async function resolveStoreCredentials(
  storeHash: string,
  env: CredentialEnv,
): Promise<StoreCredentials> {
  // Try Redis first
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    const raw = await redis.get<string>(`${STORE_KEY_PREFIX}${storeHash}`);
    if (raw) {
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as StoreCredentials & { encryptedAccessToken?: string };

      // If the token is encrypted, decrypt it [S-7]
      if (parsed.encryptedAccessToken && env.CREDENTIAL_ENCRYPTION_KEY) {
        parsed.accessToken = await decrypt(
          parsed.encryptedAccessToken,
          env.CREDENTIAL_ENCRYPTION_KEY,
        );
      }

      return parsed;
    }
  }

  // Dev fallback — single-store env vars. Gated behind DEV_MODE=true AND
  // APP_ORIGIN pointing at localhost, so a misconfigured prod deployment
  // can never silently serve with stale fallback credentials.
  const devModeEnabled = env.DEV_MODE === "true";
  const localOrigin = !!env.APP_ORIGIN && (env.APP_ORIGIN.includes("localhost") || env.APP_ORIGIN.includes("127.0.0.1"));

  if (devModeEnabled && localOrigin && env.BC_STORE_HASH && env.BC_ACCESS_TOKEN) {
    if (storeHash !== env.BC_STORE_HASH) {
      throw new Error(
        `Store hash mismatch: requested ${storeHash} but env has ${env.BC_STORE_HASH}`,
      );
    }
    return {
      storeHash: env.BC_STORE_HASH,
      accessToken: env.BC_ACCESS_TOKEN,
      scope: "store_v2_default",
      adminId: 1,
    };
  }

  throw new Error(
    `No credentials found for store ${storeHash}. Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. For dev, also set DEV_MODE=true, APP_ORIGIN=http://localhost:*, BC_STORE_HASH, BC_ACCESS_TOKEN.`,
  );
}
