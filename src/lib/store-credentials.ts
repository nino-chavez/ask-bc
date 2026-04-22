import { getRedis } from './redis';
import crypto from 'crypto';

interface StoreCredentials {
  storeHash: string;
  accessToken: string;
  scope: string;
  adminId: number;
}

interface EncryptedStoreCredentials {
  storeHash: string;
  scope: string;
  adminId: number;
  encryptedAccessToken: string;
}

const STORE_KEY_PREFIX = 'ask-bc:store:';
const USER_KEY_PREFIX = 'ask-bc:user:';

// ─── Token encryption at rest [S-7] ────────────────────────────────
// AES-256-GCM. Key shared between Vercel (writes) and Worker (reads).
// When CREDENTIAL_ENCRYPTION_KEY is set, tokens are encrypted before
// being written to Redis. The Worker's credentials.ts decrypts them.

function getEncryptionKey(): Buffer | null {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null; // 32 bytes = 64 hex chars
  return Buffer.from(hex, 'hex');
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY not set or invalid');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  });
}

function decryptToken(encryptedJson: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY not set or invalid');
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return decipher.update(Buffer.from(ciphertext, 'base64')) + decipher.final('utf8');
}

// In-memory fallback for local dev (lost on restart, but survives hot reloads in dev)
// In production, Redis is REQUIRED.
const memoryStore = new Map<string, string>();

// File-based fallback for local dev (survives full restarts)
let fileStore: Record<string, string> | null = null;
const CREDENTIALS_FILE = '.credentials.json';

function getFileStore(): Record<string, string> {
  if (fileStore) return fileStore;
  // File-based credential storage is dev-only [S-7 hardening].
  // In production, Redis is the sole persistence layer.
  if (process.env.NODE_ENV !== 'development') {
    fileStore = {};
    return fileStore;
  }
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), CREDENTIALS_FILE);
    if (fs.existsSync(filePath)) {
      fileStore = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return fileStore!;
    }
  } catch { /* not available (e.g. edge runtime, vercel) */ }
  fileStore = {};
  return fileStore;
}

function writeFileStore(data: Record<string, string>): void {
  if (process.env.NODE_ENV !== 'development') return; // never write in production
  fileStore = data;
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(process.cwd(), CREDENTIALS_FILE), JSON.stringify(data, null, 2));
  } catch { /* read-only filesystem — ok in production with Redis */ }
}

async function setKey(key: string, value: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(key, value);
    return;
  }
  // Dev fallback: memory + file
  memoryStore.set(key, value);
  const store = getFileStore();
  store[key] = value;
  writeFileStore(store);
}

async function getKey(key: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    return redis.get<string>(key);
  }
  // Dev fallback: memory first, then file
  return memoryStore.get(key) ?? getFileStore()[key] ?? null;
}

async function delKey(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }
  memoryStore.delete(key);
  const store = getFileStore();
  delete store[key];
  writeFileStore(store);
}

export async function saveStoreCredentials(creds: StoreCredentials): Promise<void> {
  // CREDENTIAL_ENCRYPTION_KEY is required (env schema enforces presence).
  // No plaintext fallback — a missing/malformed key must fail closed so a
  // prod misconfiguration can never silently persist unencrypted tokens.
  const encrypted: EncryptedStoreCredentials = {
    storeHash: creds.storeHash,
    scope: creds.scope,
    adminId: creds.adminId,
    encryptedAccessToken: encryptToken(creds.accessToken),
  };
  await setKey(`${STORE_KEY_PREFIX}${creds.storeHash}`, JSON.stringify(encrypted));
}

export async function getStoreCredentials(storeHash: string): Promise<StoreCredentials | null> {
  const data = await getKey(`${STORE_KEY_PREFIX}${storeHash}`);
  if (!data) return null;
  const parsed = typeof data === 'string' ? JSON.parse(data) : data as Record<string, unknown>;

  // Always encrypted after A13. A legacy plaintext record (pre-hardening)
  // is a flag that something wrote credentials before encryption was
  // mandatory — refuse to serve it so the merchant reinstalls under the
  // new regime.
  if ('encryptedAccessToken' in parsed && typeof parsed.encryptedAccessToken === 'string') {
    return {
      storeHash: parsed.storeHash as string,
      scope: parsed.scope as string,
      adminId: parsed.adminId as number,
      accessToken: decryptToken(parsed.encryptedAccessToken),
    };
  }

  throw new Error(
    `Store ${storeHash} has legacy plaintext credentials. Merchant must reinstall the app.`,
  );
}

export async function deleteStoreCredentials(storeHash: string): Promise<void> {
  await delKey(`${STORE_KEY_PREFIX}${storeHash}`);
}

export async function saveStoreUser(
  storeHash: string,
  userId: number,
  email: string,
  isAdmin: boolean,
): Promise<void> {
  await setKey(
    `${USER_KEY_PREFIX}${storeHash}:${userId}`,
    JSON.stringify({ storeHash, userId, email, isAdmin }),
  );
}

export async function deleteStoreUser(storeHash: string, userId: number): Promise<void> {
  await delKey(`${USER_KEY_PREFIX}${storeHash}:${userId}`);
}
