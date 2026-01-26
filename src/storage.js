// IndexedDB operations for storing bird clips

import { CONFIG } from './config.js';

let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(CONFIG.STORE_NAME)) {
        const store = database.createObjectStore(CONFIG.STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveClip(blob, thumbnail = null) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);

    const clip = {
      blob,
      thumbnail,
      timestamp: Date.now(),
      size: blob.size,
    };

    const request = store.add(clip);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllClips() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG.STORE_NAME);
    const index = store.index('timestamp');

    const request = index.openCursor(null, 'prev'); // Newest first
    const clips = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        clips.push({ ...cursor.value, id: cursor.value.id });
        cursor.continue();
      } else {
        resolve(clips);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getClip(id) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG.STORE_NAME);

    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteClip(id) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);

    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getStorageStats() {
  const clips = await getAllClips();
  const totalSize = clips.reduce((sum, clip) => sum + (clip.size || 0), 0);

  return {
    clipCount: clips.length,
    totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
  };
}

export async function clearAllClips() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);

    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// For testing - allows injecting a mock database
export function setDB(mockDB) {
  db = mockDB;
}

export function getDB() {
  return db;
}
