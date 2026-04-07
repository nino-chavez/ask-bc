import type { UIMessage } from 'ai';

const DB_NAME = 'ask-bc-chat';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';

/** Simplified message format that survives JSON/IndexedDB round-trip. */
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolNames?: string[];
}

export interface ChatSession {
  id: string;
  storeHash: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Delete old store if upgrading
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('storeHash', 'storeHash', { unique: false });
      store.createIndex('updatedAt', 'updatedAt', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Extract serializable data from UIMessage. */
function toStoredMessage(msg: UIMessage): StoredMessage {
  const textParts: string[] = [];
  const toolNames: string[] = [];

  for (const part of msg.parts || []) {
    if (part.type === 'text' && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type.startsWith('tool-')) {
      toolNames.push(part.type.replace(/^tool-/, ''));
    }
  }

  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    text: textParts.join(''),
    toolNames: toolNames.length > 0 ? toolNames : undefined,
  };
}

/** Reconstruct UIMessage from stored format. */
function toUIMessage(stored: StoredMessage): UIMessage {
  const parts: UIMessage['parts'] = [];

  // Add tool parts first (they appear before text in the UI)
  if (stored.toolNames) {
    for (const name of stored.toolNames) {
      parts.push({
        type: `tool-${name}`,
        toolCallId: `restored-${name}`,
        state: 'output-available',
      } as UIMessage['parts'][number]);
    }
  }

  if (stored.text) {
    parts.push({ type: 'text', text: stored.text });
  }

  return {
    id: stored.id,
    role: stored.role,
    parts,
  } as UIMessage;
}

export async function saveSession(session: ChatSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function listSessions(storeHash: string, limit = 30): Promise<ChatSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('storeHash');
    const request = index.getAll(storeHash);
    request.onsuccess = () => {
      const sessions = (request.result as ChatSession[])
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Convert UIMessages to stored format for saving. */
export function serializeMessages(messages: UIMessage[]): StoredMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(toStoredMessage)
    .filter((m) => m.text); // skip empty messages
}

/** Convert stored messages back to UIMessages for restoring. */
export function deserializeMessages(stored: StoredMessage[]): UIMessage[] {
  return stored.map(toUIMessage);
}

/** Generate a title from the first user message. */
export function titleFromStoredMessages(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  return first?.text.slice(0, 60) || 'New chat';
}
