'use client';
// Small key-value store on IndexedDB: books with images outgrow localStorage (about 5 MB per site).

const DB = 'russian-code';
const STORE = 'books';
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('IDB_UNAVAILABLE')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('IDB_UNAVAILABLE'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || Error('IDB_WRITE_FAILED'));
    tx.onabort = () => reject(tx.error || Error('IDB_WRITE_FAILED'));
  }));
}

export const localStore = {
  get: <T>(key: string) => run<T | undefined>('readonly', s => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => run('readwrite', s => s.put(value, key)).then(() => undefined),
  remove: (key: string) => run('readwrite', s => s.delete(key)).then(() => undefined),
  keys: () => run<IDBValidKey[]>('readonly', s => s.getAllKeys()).then(keys => keys.map(String)),
};
