export const INDEXEDDB_NAME = "snookerPracticePWA.db";
export const INDEXEDDB_VERSION = 2;
export const INDEXEDDB_LOG_STORE = "logs";
export const INDEXEDDB_SESSION_STORE = "sessions";
export const INDEXEDDB_MIGRATION_KEY = "snookerPracticePWA.indexedDBMigration.v1";
let activeDb = null;
function rememberDb(db) {
  activeDb = db;
  try { db.addEventListener?.("close", () => { if (activeDb === db) activeDb = null; }); } catch(_) {}
  try { db.addEventListener?.("versionchange", () => { try { closeDb(db); } catch(_) {} if (activeDb === db) activeDb = null; }); } catch(_) {}
  return db;
}
function closeDb(db) {
  try { db?.close?.(); } finally { if (activeDb === db) activeDb = null; }
}

function safeAbortTransaction(tx) {
  try { if (tx && tx.readyState !== "done") tx.abort(); } catch(_) {}
}

function rejectOnceFactory(reject) {
  let settled = false;
  return error => {
    if (settled) return;
    settled = true;
    reject(error);
  };
}

const SCHEMA_MIGRATIONS = {
  1(db) { ensureObjectStores(db); },
  2(db) { ensureObjectStores(db); }
};

function runSchemaMigrations(db, oldVersion, newVersion) {
  ensureObjectStores(db);
  for (let version = Math.max(1, Number(oldVersion || 0) + 1); version <= Number(newVersion || INDEXEDDB_VERSION); version += 1) {
    try { SCHEMA_MIGRATIONS[version]?.(db); } catch(error) { console.warn("IndexedDB schema migration skipped", version, error); }
  }
}

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
    if (activeDb && activeDb.objectStoreNames?.contains(INDEXEDDB_LOG_STORE) && activeDb.objectStoreNames?.contains(INDEXEDDB_SESSION_STORE)) {
      return resolve(activeDb);
    }
    const req = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    req.onupgradeneeded = (event) => {
      runSchemaMigrations(req.result, event.oldVersion, event.newVersion || INDEXEDDB_VERSION);
    };
    req.onsuccess = () => {
      const db = rememberDb(req.result);
      if (!db.objectStoreNames.contains(INDEXEDDB_LOG_STORE) || !db.objectStoreNames.contains(INDEXEDDB_SESSION_STORE)) {
        closeDb(db);
        reject(new Error("IndexedDB opened but required object stores are missing. Reload once to complete schema upgrade."));
        return;
      }
      resolve(db);
    };
    req.onblocked = () => { console.warn("IndexedDB upgrade is blocked by another open app tab. Waiting for the browser to complete the upgrade."); };
    req.onerror = () => reject(req.error || new Error("Could not open IndexedDB."));
  });
}

export function idbGetAll(storeName) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    const rejectOnce = rejectOnceFactory(reject);
    try {
      tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => { safeAbortTransaction(tx); rejectOnce(req.error || new Error("IndexedDB getAll failed.")); };
      tx.onerror = () => { rejectOnce(tx.error || new Error("IndexedDB read transaction failed.")); };
      tx.onabort = () => { rejectOnce(tx.error || new Error("IndexedDB read transaction aborted.")); };
    } catch(e) {
      closeDb(db);
      rejectOnce(e);
    }
  }));
}

export function idbGetStores(storeNames) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    const out = {};
    if (!Array.isArray(storeNames) || storeNames.length === 0) {
      closeDb(db);
      resolve(out);
      return;
    }
    let remaining = storeNames.length;
    let settled = false;
    try {
      const tx = db.transaction(storeNames, "readonly");
      storeNames.forEach(name => {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          out[name] = req.result || [];
          remaining -= 1;
          if (remaining === 0 && !settled) {
            settled = true;
            resolve(out);
          }
        };
        req.onerror = () => {
          if (!settled) {
            settled = true;
            reject(req.error);
          }
        };
      });
      tx.onerror = () => {
        if (!settled) {
          settled = true;
          reject(tx.error || new Error("IndexedDB multi-store read failed."));
        }
      };
      tx.onabort = () => {
        if (!settled) {
          settled = true;
          reject(tx.error || new Error("IndexedDB multi-store read aborted."));
        }
      };
    } catch(e) {
      closeDb(db);
      reject(e);
    }
  }));
}

export function idbReplaceAll(storeName, rows) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    const rejectOnce = rejectOnceFactory(reject);
    try {
      tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.clear();
      (rows || []).forEach(row => { if (row && row.id) store.put(row); });
      tx.oncomplete = () => { resolve(true); };
      tx.onerror = () => { safeAbortTransaction(tx); rejectOnce(tx.error || new Error("IndexedDB replaceAll failed.")); };
      tx.onabort = () => { rejectOnce(tx.error || new Error("IndexedDB replaceAll aborted.")); };
    } catch(e) {
      safeAbortTransaction(tx);
      closeDb(db);
      rejectOnce(e);
    }
  }));
}

export function idbPut(storeName, item) {
  if (!item || !item.id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    const rejectOnce = rejectOnceFactory(reject);
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => { resolve(true); };
      tx.onerror = () => { safeAbortTransaction(tx); rejectOnce(tx.error || new Error("IndexedDB put failed.")); };
      tx.onabort = () => { rejectOnce(tx.error || new Error("IndexedDB put aborted.")); };
    } catch(e) {
      safeAbortTransaction(tx);
      closeDb(db);
      rejectOnce(e);
    }
  }));
}



export function idbReplaceStores(logRows = [], sessionRows = []) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction([INDEXEDDB_LOG_STORE, INDEXEDDB_SESSION_STORE], "readwrite");
      const logStore = tx.objectStore(INDEXEDDB_LOG_STORE);
      const sessionStore = tx.objectStore(INDEXEDDB_SESSION_STORE);
      logStore.clear();
      sessionStore.clear();
      (logRows || []).forEach(row => { if (row && row.id) logStore.put(row); });
      (sessionRows || []).forEach(row => { if (row && row.id) sessionStore.put(row); });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { safeAbortTransaction(tx); reject(tx.error || new Error("IndexedDB atomic replace failed.")); };
      tx.onabort = () => reject(tx.error || new Error("IndexedDB atomic replace aborted."));
    } catch(e) {
      safeAbortTransaction(tx);
      closeDb(db);
      reject(e);
    }
  }));
}

export function idbPutBundle(logs = [], sessions = []) {
  const logRows = (Array.isArray(logs) ? logs : [logs]).filter(row => row && row.id);
  const sessionRows = (Array.isArray(sessions) ? sessions : [sessions]).filter(row => row && row.id);
  if (!logRows.length && !sessionRows.length) return Promise.resolve(true);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      const storeNames = [];
      if (logRows.length) storeNames.push(INDEXEDDB_LOG_STORE);
      if (sessionRows.length) storeNames.push(INDEXEDDB_SESSION_STORE);
      tx = db.transaction(storeNames, "readwrite");
      if (logRows.length) {
        const logStore = tx.objectStore(INDEXEDDB_LOG_STORE);
        logRows.forEach(row => logStore.put(row));
      }
      if (sessionRows.length) {
        const sessionStore = tx.objectStore(INDEXEDDB_SESSION_STORE);
        sessionRows.forEach(row => sessionStore.put(row));
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { safeAbortTransaction(tx); reject(tx.error || new Error("IndexedDB bundle write failed.")); };
      tx.onabort = () => reject(tx.error || new Error("IndexedDB bundle write aborted."));
    } catch(e) {
      safeAbortTransaction(tx);
      closeDb(db);
      reject(e);
    }
  }));
}

export function idbDelete(storeName, id) {
  if (!id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    const rejectOnce = rejectOnceFactory(reject);
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => { resolve(true); };
      tx.onerror = () => { safeAbortTransaction(tx); rejectOnce(tx.error || new Error("IndexedDB delete failed.")); };
      tx.onabort = () => { rejectOnce(tx.error || new Error("IndexedDB delete aborted.")); };
    } catch(e) {
      safeAbortTransaction(tx);
      closeDb(db);
      rejectOnce(e);
    }
  }));
}


export function idbDeleteDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return resolve(false);
    if (activeDb) {
      try { activeDb.close(); } catch(_) {}
      activeDb = null;
    }
    const req = indexedDB.deleteDatabase(INDEXEDDB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Could not delete IndexedDB database."));
    req.onblocked = () => reject(new Error("IndexedDB delete is blocked by another open app tab. Close other Snooker app tabs and reload."));
  });
}



