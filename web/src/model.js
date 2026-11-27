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
        links: (item.links || [])
          .map((l) => ({ text: String(l.text || l.url || ''), url: safeUrl(l.url) }))
          .filter((l) => l.url),
        subitems: (item.subitems || []).map((t) => String(t)),
        pageEditions: Array.isArray(item.pageEditions) ? item.pageEditions.map(String) : [],
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
  // Ô N/A nhưng trang tính năng ghi edition này được hỗ trợ: thêm ghi chú †.
  if (!cell) {
    const notes = (row.pageEditions || []).includes(edition)
      ? [{ mark: '†', text: 'Theo trang tính năng: Có' }] : [];
    return { v: 'N/A', notes };
  }
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

// Thứ tự khi sắp xếp cột edition: Có, Không, giá trị khác, N/A.
function rank(v) {
  if (v.startsWith('Có')) return 0;
  if (v === 'Không') return 1;
  if (v === 'N/A') return 3;
  return 2;
}

/**
 * sort: { key, dir } với key là 'section', 'feature' hoặc tên edition; dir là 'asc' | 'desc'.
 * Sắp xếp ổn định: dòng bằng nhau giữ thứ tự gốc.
 */
export function sortRows(rows, sort) {
  if (!sort) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const text = sort.key === 'section' || sort.key === 'feature';
  return [...rows].sort((a, b) => {
    let c;
    if (text) {
      c = String(a[sort.key]).localeCompare(String(b[sort.key]), 'vi');
    } else {
      const ca = cellOf(a, sort.key).v;
      const cb = cellOf(b, sort.key).v;
      c = rank(ca) - rank(cb) || ca.localeCompare(cb, 'vi');
    }
    return c * dir;
  });
}

/**
 * Xuất CSV: Section, Feature, Link đầu tiên, rồi giá trị từng edition.
 * Ô bắt đầu bằng = + - @ được thêm dấu ' để không bị Excel hiểu là công thức.
 */
export function toCsv(rows, editions) {
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [['Section', 'Feature', 'Link', ...editions.map((e) => e.name)].map(esc).join(',')];
  for (const r of rows) {
    const link = r.links.length ? r.links[0].url : '';
    lines.push([r.section, r.feature, link, ...editions.map((e) => cellOf(r, e.name).v)].map(esc).join(','));
  }
  return lines.join('\r\n');
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
