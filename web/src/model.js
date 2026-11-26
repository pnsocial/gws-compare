/** Chỉ cho http(s), theo quy tắc của CLAUDE.md. */
export function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

/** Section sắp theo title, đúng như web yêu cầu. */
export function sortSections(sections) {
  return [...sections].sort((a, b) => String(a.title).localeCompare(String(b.title), 'vi'));
}

/** Biến document section thành danh sách dòng phẳng, mỗi dòng giữ notes của section. */
export function flatten(sections) {
  const rows = [];
  for (const s of sections) {
    for (const item of s.items || []) {
      rows.push({
        section: s.title || '',
        feature: item.feature || '',
        link: safeUrl(item.links?.[0]?.url),
        notes: s.notes || {},
        values: item.values || {}
      });
    }
  }
  return rows;
}

/** Ô của một edition. Edition không có trong values nghĩa là N/A. */
export function cellOf(row, edition) {
  const cell = row.values[edition];
  if (!cell) return { v: 'N/A', notes: [] };
  return {
    v: String(cell.v ?? ''),
    notes: (cell.n || []).map((id) => row.notes[id]).filter(Boolean)
  };
}

function signature(cell) {
  return cell.v + '|' + cell.notes.map((n) => n.mark + n.text).join('|');
}

/** Khác nhau giữa các edition đang hiển thị, so cả giá trị lẫn chú thích. */
export function differs(row, editionNames) {
  if (editionNames.length < 2) return false;
  const sigs = new Set(editionNames.map((name) => signature(cellOf(row, name))));
  return sigs.size > 1;
}

/**
 * state: { section, q, diff }. editions: các edition đang hiển thị (đã lọc family và checkbox).
 */
export function filterRows(rows, state, editions) {
  const q = state.q.trim().toLowerCase();
  const names = editions.map((e) => e.name);
  return rows.filter((r) => {
    if (state.section && r.section !== state.section) return false;
    if (q && !r.feature.toLowerCase().includes(q) && !r.section.toLowerCase().includes(q)) return false;
    if (state.diff && !differs(r, names)) return false;
    return true;
  });
}
