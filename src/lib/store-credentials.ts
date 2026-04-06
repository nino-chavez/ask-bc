import { getRedis } from './redis';

interface StoreCredentials {
  storeHash: string;
  accessToken: string;
  scope: string;
  adminId: number;
}

const STORE_KEY_PREFIX = 'app-ai:store:';
const USER_KEY_PREFIX = 'app-ai:user:';

/**
 * Save store credentials to Redis after OAuth install.
 */
export async function saveStoreCredentials(creds: StoreCredentials): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.warn('Redis not configured — store credentials not persisted');
    return;
  }
  await redis.set(`${STORE_KEY_PREFIX}${creds.storeHash}`, JSON.stringify(creds));
}

/**
 * Load store credentials from Redis.
 */
export async function getStoreCredentials(storeHash: string): Promise<StoreCredentials | null> {
  const redis = getRedis();
  if (!redis) return null;

  const data = await redis.get<string>(`${STORE_KEY_PREFIX}${storeHash}`);
  if (!data) return null;

  return typeof data === 'string' ? JSON.parse(data) : data as unknown as StoreCredentials;
}

/**
 * Delete store credentials (on uninstall).
 */
export async function deleteStoreCredentials(storeHash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${STORE_KEY_PREFIX}${storeHash}`);
}

/**
 * Save a store user record.
 */
export async function saveStoreUser(
  storeHash: string,
  userId: number,
  email: string,
  isAdmin: boolean,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(
    `${USER_KEY_PREFIX}${storeHash}:${userId}`,
    JSON.stringify({ storeHash, userId, email, isAdmin }),
  );
}

/**
 * Delete a store user record.
 */
export async function deleteStoreUser(storeHash: string, userId: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${USER_KEY_PREFIX}${storeHash}:${userId}`);
}
