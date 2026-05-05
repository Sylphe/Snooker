export const INDEXEDDB_NAME = "snookerPracticePWA.db";
export const INDEXEDDB_VERSION = 2;
export const INDEXEDDB_LOG_STORE = "logs";
export const INDEXEDDB_SESSION_STORE = "sessions";
export const INDEXEDDB_MIGRATION_KEY = "snookerPracticePWA.indexedDBMigration.v1";

function ensureObjectStores(db) {
  if (!db.objectStoreNames.contains(INDEXEDDB_LOG_STORE)) {
    const logs = db.createObjectStore(INDEXEDDB_LOG_STORE, {keyPath:"id"});
    logs.createIndex("createdAt", "createdAt", {unique:false});
    logs.createIndex("routineId", "routineId", {unique:false});
    logs.createIndex("sessionId", "sessionId", {unique:false});
  }
  if (!db.objectStoreNames.contains(INDEXEDDB_SESSION_STORE)) {
    const sessions = db.createObjectStore(INDEXEDDB_SESSION_STORE, {keyPath:"id"});
    sessions.createIndex("startedAt", "startedAt", {unique:false});
    sessions.createIndex("endedAt", "endedAt", {unique:false});
  }
}

export function openSnookerDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB is not available in this browser."));
    const req = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    req.onupgradeneeded = () => {
      ensureObjectStores(req.result);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEXEDDB_LOG_STORE) || !db.objectStoreNames.contains(INDEXEDDB_SESSION_STORE)) {
        db.close();
        reject(new Error("IndexedDB opened but required object stores are missing. Reload once to complete schema upgrade."));
        return;
      }
      resolve(db);
    };
    req.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open app tab. Close other Snooker app tabs and reload."));
    req.onerror = () => reject(req.error || new Error("Could not open IndexedDB."));
  });
}

export function idbGetAll(storeName) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbReplaceAll(storeName, rows) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.clear();
      (rows || []).forEach(row => { if (row && row.id) store.put(row); });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbPut(storeName, item) {
  if (!item || !item.id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbDelete(storeName, id) {
  if (!id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}
