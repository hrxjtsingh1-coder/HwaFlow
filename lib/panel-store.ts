/**
 * Panel image storage.
 *
 * Raw panels are far too big for localStorage — a single chapter of data URLs
 * exhausts the ~5 MB quota. They live in IndexedDB instead, behind these five
 * functions, so no component ever touches IDB directly.
 *
 *   DB      hwaflow-media
 *   store   panels
 *   key     panelId
 *
 * Swap point: this becomes a Supabase Storage upload to a `pages` bucket, keyed
 * by `panel.id`. The metadata stays in localStorage either way.
 */

const DB_NAME = "hwaflow-media";
const STORE_NAME = "panels";
const DB_VERSION = 1;

export class PanelStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanelStoreError";
  }
}

const UNAVAILABLE_COPY =
  "This browser is blocking local storage. Turn off private mode and try again.";

let databasePromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new PanelStoreError(UNAVAILABLE_COPY));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new PanelStoreError(UNAVAILABLE_COPY));
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new PanelStoreError(
          "We couldn't open this browser's image storage. Reload the page and try again."
        )
      );
    request.onblocked = () =>
      reject(
        new PanelStoreError(
          "Another HwaFlow tab is holding the image storage. Close it and try again."
        )
      );
  }).catch((error: unknown) => {
    // Allow a later call to retry after a transient failure.
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return getDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = work(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(
            new PanelStoreError(
              "We couldn't read or save that panel image. Try again."
            )
          );
        transaction.onabort = () =>
          reject(
            new PanelStoreError(
              "We couldn't save that panel image. Browser storage may be full."
            )
          );
      })
  );
}

export async function putPanelImage(
  panelId: string,
  blob: Blob
): Promise<void> {
  await runRequest("readwrite", (store) => store.put(blob, panelId));
}

export async function getPanelImage(
  panelId: string
): Promise<Blob | null> {
  try {
    const value = await runRequest<Blob | undefined>("readonly", (store) =>
      store.get(panelId)
    );
    return value instanceof Blob ? value : null;
  } catch {
    // A missing or unreadable image is a UI state, not a crash.
    return null;
  }
}

export async function deletePanelImage(panelId: string): Promise<void> {
  await runRequest("readwrite", (store) => store.delete(panelId));
}

export async function deleteChapterImages(
  panelIds: string[]
): Promise<void> {
  if (panelIds.length === 0) return;
  await Promise.all(panelIds.map((panelId) => deletePanelImage(panelId)));
}

/** Used by the storage-reset path. */
export async function deleteAllPanelImages(): Promise<void> {
  await runRequest("readwrite", (store) => store.clear());
}
