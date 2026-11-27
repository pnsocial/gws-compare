import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from './firebase.js';
import { FAMILY_LABELS } from './model.js';

// Nhóm mở rộng ngoài Google Workspace, lấy từ extras/<id> (do Apps Script ghi).
const EXTRA_FAMILIES = ['cloudidentity', 'aiexpanded'];
const CACHE_KEY = 'gwsc:extras:v1';
const SCHEMA_VERSION = 1;

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && c.schemaVersion === SCHEMA_VERSION && c.families ? c : { schemaVersion: SCHEMA_VERSION, families: {} };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, families: {} };
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Hết bộ nhớ hoặc bị chặn: vẫn chạy, chỉ là không có cache.
  }
}

/** Chuyển dữ liệu thô của một nhóm thành edition và section dùng chung với Workspace. */
function toModel(id, data) {
  const prefix = id === 'aiexpanded' ? 'AI: ' : '';
  const nameOf = (ed) => prefix + ed;
  const editions = (data.editions || []).map((ed) => ({ name: nameOf(ed), label: ed, family: id }));
  const sections = (data.sections || []).map((s) => ({
    title: `${FAMILY_LABELS[id]}: ${s.title}`,
    family: id,
    notes: {},
    items: (s.items || []).map((it) => ({
      feature: it.feature,
      links: (it.links || []).map((l) => ({ text: String(l.text || l.url || ''), url: String(l.url || '') })),
      subitems: [],
      values: Object.fromEntries(Object.entries(it.values || {}).map(([ed, c]) => [nameOf(ed), { v: c.v, n: [] }]))
    }))
  }));
  return { editions, sections };
}

/**
 * Trả về { editions, sections } của các nhóm mở rộng. hashes là extrasHashes trong catalog/current:
 * nếu hash của nhóm trùng với cache thì không đọc lại doc. Lỗi của một nhóm không chặn Workspace:
 * nhóm đó bị bỏ qua và ghi cảnh báo ra console.
 * Tên edition nội bộ có tiền tố nhóm (ví dụ "AI: Business Starter") để không trùng với Workspace;
 * tên hiển thị (label) là tên như trang Google.
 */
export async function loadExtras(hashes = {}) {
  const out = { editions: [], sections: [] };
  const cache = readCache();
  for (const id of EXTRA_FAMILIES) {
    try {
      const hash = typeof hashes[id] === 'string' ? hashes[id] : null;
      const cached = cache.families[id];
      let data;
      if (hash && cached && cached.hash === hash) {
        data = cached.data;
      } else {
        const snap = await getDoc(doc(db, 'extras', id));
        if (!snap.exists()) continue;
        const raw = snap.data();
        data = { editions: raw.editions || [], sections: raw.sections || [] };
        if (hash) cache.families[id] = { hash, data };
      }
      const model = toModel(id, data);
      out.editions.push(...model.editions);
      out.sections.push(...model.sections);
    } catch (err) {
      console.warn(`Không tải được nhóm ${id}:`, err);
    }
  }
  for (const id of Object.keys(cache.families)) {
    if (!EXTRA_FAMILIES.includes(id) || !hashes[id]) delete cache.families[id];
  }
  writeCache(cache);
  return out;
}
