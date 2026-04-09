import { env } from '@/lib/env';

interface AppExtensionInput {
  context: 'PANEL' | 'LINK';
  model: 'ORDERS' | 'PRODUCTS' | 'CUSTOMERS';
  url: string;
  label: {
    defaultValue: string;
    locales?: { value: string; localeCode: string }[];
  };
}

interface AppExtension {
  id: string;
  context: string;
  model: string;
  url: string;
  label: { defaultValue: string };
}

const CREATE_MUTATION = `
  mutation AppExtension($input: CreateAppExtensionInput!) {
    appExtension {
      createAppExtension(input: $input) {
        appExtension {
          id
          context
          model
          url
          label {
            defaultValue
          }
        }
      }
    }
  }
`;

const LIST_QUERY = `
  query {
    store {
      appExtensions {
        edges {
          node {
            id
            context
            model
            url
            label {
              defaultValue
            }
          }
        }
      }
    }
  }
`;

const DELETE_MUTATION = `
  mutation DeleteAppExtension($input: DeleteAppExtensionInput!) {
    appExtension {
      deleteAppExtension(input: $input) {
        deletedAppExtensionId
      }
    }
  }
`;

async function graphqlRequest(
  storeHash: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await fetch(
    `${env.BIGCOMMERCE_API_URL}/stores/${storeHash}/graphql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Auth-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} — ${text}`);
  }

  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

/**
 * Register the Ask BC App Extensions for Orders and Products pages.
 * Called during OAuth install callback.
 */
export async function registerAppExtensions(
  storeHash: string,
  accessToken: string,
  appOrigin: string,
): Promise<AppExtension[]> {
  // First check what's already registered to avoid duplicates
  const existing = await listAppExtensions(storeHash, accessToken);
  const registeredModels = new Set(existing.map((e) => e.model));

  const extensions: AppExtensionInput[] = [];

  if (!registeredModels.has('ORDERS')) {
    extensions.push({
      context: 'PANEL',
      model: 'ORDERS',
      url: `/stores/${storeHash}/extensions/orders/\${id}`,
      label: {
        defaultValue: 'Ask BC',
        locales: [{ value: 'Ask BC', localeCode: 'en' }],
      },
    });
  }

  if (!registeredModels.has('PRODUCTS')) {
    extensions.push({
      context: 'PANEL',
      model: 'PRODUCTS',
      url: `/stores/${storeHash}/extensions/products/\${id}`,
      label: {
        defaultValue: 'Ask BC',
        locales: [{ value: 'Ask BC', localeCode: 'en' }],
      },
    });
  }

  if (!registeredModels.has('CUSTOMERS')) {
    extensions.push({
      context: 'PANEL',
      model: 'CUSTOMERS',
      url: `/stores/${storeHash}/extensions/customers/\${id}`,
      label: {
        defaultValue: 'Ask BC',
        locales: [{ value: 'Ask BC', localeCode: 'en' }],
      },
    });
  }

  const results: AppExtension[] = [];
  for (const ext of extensions) {
    try {
      const data = await graphqlRequest(storeHash, accessToken, CREATE_MUTATION, {
        input: ext,
      });
      const created = data.appExtension.createAppExtension.appExtension;
      console.log(`Registered App Extension: ${created.model} → ${created.id}`);
      results.push(created);
    } catch (error) {
      console.error(`Failed to register ${ext.model} extension:`, error);
    }
  }

  return results;
}

/**
 * List existing App Extensions for this app.
 */
export async function listAppExtensions(
  storeHash: string,
  accessToken: string,
): Promise<AppExtension[]> {
  try {
    const data = await graphqlRequest(storeHash, accessToken, LIST_QUERY);
    return (data.store.appExtensions.edges || []).map(
      (e: { node: AppExtension }) => e.node,
    );
  } catch {
    return [];
  }
}

/**
 * Delete all App Extensions for this app (on uninstall).
 */
export async function deleteAppExtensions(
  storeHash: string,
  accessToken: string,
): Promise<void> {
  const extensions = await listAppExtensions(storeHash, accessToken);
  for (const ext of extensions) {
    try {
      await graphqlRequest(storeHash, accessToken, DELETE_MUTATION, {
        input: { id: ext.id },
      });
    } catch (error) {
      console.error(`Failed to delete extension ${ext.id}:`, error);
    }
  }
}
