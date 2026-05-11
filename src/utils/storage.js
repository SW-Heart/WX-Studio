const DB_NAME = 'OG_AI_DB';
const STORE_NAME = 'canvas_store';
const KEY_NAME = 'canvas_nodes';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const storage = {
  async saveNodes(nodes) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(nodes, KEY_NAME);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('IndexedDB save error:', err);
    }
  },

  async loadNodes() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('IndexedDB load error:', err);
      return [];
    }
  }
};
