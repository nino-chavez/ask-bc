import { env } from '@/lib/env';

interface BcClientConfig {
  storeHash: string;
  accessToken: string;
}

/**
 * Lightweight BigCommerce Admin API client.
 * Supports both V3 (default) and V2 endpoints.
 */
export function createBcClient({ storeHash, accessToken }: BcClientConfig) {
  const baseV3 = `${env.BIGCOMMERCE_API_URL}/stores/${storeHash}/v3`;
  const baseV2 = `${env.BIGCOMMERCE_API_URL}/stores/${storeHash}/v2`;

  async function request<T = unknown>(
    baseUrl: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Auth-Token': accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BigCommerce API error: ${response.status} ${path} — ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  return {
    get: <T = unknown>(path: string) => request<T>(baseV3, path),
    post: <T = unknown>(path: string, body: unknown) =>
      request<T>(baseV3, path, { method: 'POST', body: JSON.stringify(body) }),
    put: <T = unknown>(path: string, body: unknown) =>
      request<T>(baseV3, path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T = unknown>(path: string) =>
      request<T>(baseV3, path, { method: 'DELETE' }),

    // V2 endpoints (orders, store info)
    getV2: <T = unknown>(path: string) => request<T>(baseV2, path),
  };
}
