import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from './firebase.js';
import { FAMILY_LABELS } from './model.js';

// Nhóm mở rộng ngoài Google Workspace, lấy từ extras/<id> (do Apps Script ghi).
const EXTRA_FAMILIES = ['cloudidentity', 'aiexpanded'];

/**
 * Trả về { editions, sections } của các nhóm mở rộng. Lỗi của một nhóm không chặn Workspace:
 * nhóm đó bị bỏ qua và ghi cảnh báo ra console.
 * Tên edition nội bộ có tiền tố nhóm (ví dụ "AI: Business Starter") để không trùng với Workspace;
 * tên hiển thị (label) là tên như trang Google.
 */
export async function loadExtras() {
  const out = { editions: [], sections: [] };
  for (const id of EXTRA_FAMILIES) {
    try {
      const snap = await getDoc(doc(db, 'extras', id));
      if (!snap.exists()) continue;
      const data = snap.data();
      const prefix = id === 'aiexpanded' ? 'AI: ' : '';
      const nameOf = (ed) => prefix + ed;
      out.editions.push(...(data.editions || []).map((ed) => ({ name: nameOf(ed), label: ed, family: id })));
      for (const s of data.sections || []) {
        out.sections.push({
          title: `${FAMILY_LABELS[id]}: ${s.title}`,
          family: id,
          notes: {},
          items: (s.items || []).map((it) => ({
            feature: it.feature,
            links: [],
            subitems: [],
            values: Object.fromEntries(Object.entries(it.values || {}).map(([ed, c]) => [nameOf(ed), { v: c.v, n: [] }]))
          }))
        });
      }
    } catch (err) {
      console.warn(`Không tải được nhóm ${id}:`, err);
    }
  }
  return out;
}
