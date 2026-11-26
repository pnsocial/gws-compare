import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from './firebase.js';

const SCHEMA_VERSION = 1;
const CACHE_KEY = 'gwsc:catalog:v1';

function emptyCache() {
  return { schemaVersion: SCHEMA_VERSION, sections: {} };
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && c.schemaVersion === SCHEMA_VERSION && c.sections ? c : emptyCache();
  } catch {
    return emptyCache();
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Hết bộ nhớ hoặc bị chặn: vẫn chạy, chỉ là không có cache.
  }
}

function toDate(ts) {
  return ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
}

/**
 * Đọc catalog/current, rồi chỉ tải lại section có hash khác với cache.
 * Section không còn trong hashes bị xóa khỏi cache.
 */
export async function loadCatalog() {
  const metaSnap = await getDoc(doc(db, 'catalog', 'current'));
  if (!metaSnap.exists()) throw new Error('chưa có dữ liệu catalog');
  const meta = metaSnap.data();
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schema ${meta.schemaVersion} không được hỗ trợ`);
  }

  const hashes = meta.hashes || {};
  const cache = readCache();

  const sections = await Promise.all(Object.keys(hashes).map(async (id) => {
    const cached = cache.sections[id];
    if (cached && cached.hash === hashes[id]) return cached.doc;

    const snap = await getDoc(doc(db, 'catalog', 'current', 'sections', id));
    if (!snap.exists()) throw new Error(`thiếu section ${id}`);
    const data = snap.data();
    cache.sections[id] = { hash: hashes[id], doc: data };
    return data;
  }));

  for (const id of Object.keys(cache.sections)) {
    if (!(id in hashes)) delete cache.sections[id];
  }
  writeCache(cache);

  return {
    editions: meta.editions || [],
    featureCount: meta.featureCount || 0,
    checkedAt: toDate(meta.checkedAt),
    changedAt: toDate(meta.changedAt),
    sections
  };
}
