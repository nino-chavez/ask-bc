import { getRedis } from './redis';

interface StoreCredentials {
  storeHash: string;
  accessToken: string;
  scope: string;
  adminId: number;
}

const STORE_KEY_PREFIX = 'ask-bc:store:';
const USER_KEY_PREFIX = 'ask-bc:user:';

// In-memory fallback for local dev (lost on restart, but survives hot reloads in dev)
// In production, Redis is REQUIRED.
const memoryStore = new Map<string, string>();

// File-based fallback for local dev (survives full restarts)
let fileStore: Record<string, string> | null = null;
const CREDENTIALS_FILE = '.credentials.json';

function getFileStore(): Record<string, string> {
  if (fileStore) return fileStore;
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
  await setKey(`${STORE_KEY_PREFIX}${creds.storeHash}`, JSON.stringify(creds));
}

export async function getStoreCredentials(storeHash: string): Promise<StoreCredentials | null> {
  const data = await getKey(`${STORE_KEY_PREFIX}${storeHash}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as StoreCredentials;
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
