import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChatMessage, FileGroup, ChatSession } from '../types';

interface AppDB extends DBSchema {
  fileGroups: {
    key: string;
    value: FileGroup;
  };
  chatMessages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-timestamp': Date };
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-updatedAt': Date };
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>('doc-browser-db', 2, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('fileGroups', { keyPath: 'id' });
          const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
          chatStore.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 2) {
          const sessionStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
          sessionStore.createIndex('by-updatedAt', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
};

export const saveFileGroups = async (groups: FileGroup[]) => {
  const db = await getDB();
  const tx = db.transaction('fileGroups', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    ...groups.map(group => tx.store.put(group))
  ]);
  await tx.done;
};

export const loadFileGroups = async (): Promise<FileGroup[]> => {
  const db = await getDB();
  return db.getAll('fileGroups');
};

export const saveChatMessages = async (messages: ChatMessage[]) => {
  const db = await getDB();
  const tx = db.transaction('chatMessages', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    ...messages.map(msg => tx.store.put(msg))
  ]);
  await tx.done;
};

export const loadChatMessages = async (): Promise<ChatMessage[]> => {
  const db = await getDB();
  return db.getAllFromIndex('chatMessages', 'by-timestamp');
};

export const saveChatSession = async (session: ChatSession) => {
  const db = await getDB();
  await db.put('chatSessions', session);
};

export const loadChatSessions = async (): Promise<ChatSession[]> => {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('chatSessions', 'by-updatedAt');
  return sessions.reverse(); // Newest first
};

export const deleteChatSession = async (id: string) => {
  const db = await getDB();
  await db.delete('chatSessions', id);
};
