// Stockage local sur l'appareil (IndexedDB, avec repli sur localStorage). Aucune donnée ne quitte l'iPad.
const DB_NAME = 'dj-crate', STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getItem(key) {
  try { return await idb('readonly', s => s.get(key)); }
  catch {
    try { const v = localStorage.getItem('dj-crate:' + key); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
  }
}

export async function setItem(key, value) {
  try { await idb('readwrite', s => s.put(value, key)); return true; }
  catch {
    try { localStorage.setItem('dj-crate:' + key, JSON.stringify(value)); return true; } catch { return false; }
  }
}

/** Demande au système de ne pas purger les données de l'app. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* non pris en charge */ }
  return false;
}
