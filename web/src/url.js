// Trạng thái lọc lưu trên URL. Không có dữ liệu cá nhân.
// Tham số: f (family), e (edition, phân tách bằng dấu phẩy; bỏ qua nếu chọn tất cả),
// s (section), q (từ khóa), d (1 = chỉ hiện khác biệt),
// o (sắp xếp: "<key>|<asc|desc>", key là section, feature hoặc tên edition).

function readSort(raw, allEditionNames) {
  if (!raw) return null;
  const i = raw.lastIndexOf('|');
  if (i < 0) return null;
  const key = raw.slice(0, i);
  const dir = raw.slice(i + 1);
  const valid = key === 'section' || key === 'feature' || allEditionNames.includes(key);
  return valid && (dir === 'asc' || dir === 'desc') ? { key, dir } : null;
}

export function readUrl(allEditionNames) {
  const p = new URLSearchParams(location.search);
  const e = p.get('e');
  let editions = new Set(allEditionNames);
  if (e) {
    const picked = e.split(',').filter((n) => allEditionNames.includes(n));
    if (picked.length) editions = new Set(picked);
  }
  return {
    family: p.get('f') || '',
    section: p.get('s') || '',
    q: p.get('q') || '',
    diff: p.get('d') === '1',
    sort: readSort(p.get('o'), allEditionNames),
    editions
  };
}

export function writeUrl(state, allEditionNames) {
  const p = new URLSearchParams();
  if (state.family) p.set('f', state.family);
  if (state.section) p.set('s', state.section);
  if (state.q) p.set('q', state.q);
  if (state.diff) p.set('d', '1');
  if (state.sort) p.set('o', `${state.sort.key}|${state.sort.dir}`);
  const all = allEditionNames.every((n) => state.editions.has(n));
  if (!all) p.set('e', allEditionNames.filter((n) => state.editions.has(n)).join(','));
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}
