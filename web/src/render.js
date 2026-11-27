import { cellOf } from './model.js';

// Mọi nội dung đưa vào DOM đều qua textContent. Không dùng innerHTML với dữ liệu.

let tipCounter = 0;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function valueClass(v) {
  if (v === 'N/A') return 'na';
  if (v.startsWith('Có')) return 'co';
  if (v === 'Không') return 'khong';
  return 'text';
}

// Các chú thích đang có trên bảng. Một bộ lắng nghe chung đóng chúng khi chạm/bấm ra ngoài.
const tooltips = new Set();

/** Gỡ mọi chú thích đang nằm trên body (khi bảng được vẽ lại). */
function clearTooltips() {
  for (const t of tooltips) t.pop.remove();
  tooltips.clear();
}

function closeOutside(target) {
  for (const t of tooltips) {
    if (t.pop.hidden) continue;
    if (t.btn.contains(target) || t.pop.contains(target)) continue;
    t.close();
  }
}

document.addEventListener('pointerdown', (e) => closeOutside(e.target));
document.addEventListener('scroll', () => { for (const t of tooltips) t.close(); }, { capture: true, passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const t of tooltips) t.close();
});

/**
 * Tooltip chú thích.
 * - Chuột: rê vào thì hiện, rời ra thì ẩn (trừ khi đã ghim bằng click).
 * - Chạm hoặc click: bật/tắt và ghim. Chạm/bấm ra ngoài hoặc Escape thì đóng.
 * Hover chỉ áp dụng cho chuột để chạm trên điện thoại không bị hiện lại sau khi đóng.
 */
/**
 * Đặt chú thích cố định trên màn hình, cạnh nút bấm, để không bị cắt bởi bảng cuộn
 * hay bị các ô bên cạnh che (đặc biệt trên điện thoại).
 */
function placeTooltip(btn, pop) {
  if (pop.parentElement !== document.body) document.body.append(pop);
  const r = btn.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

function attachTooltip(btn, pop) {
  let pinned = false;
  const show = () => {
    pop.hidden = false;
    placeTooltip(btn, pop);
    btn.setAttribute('aria-expanded', 'true');
  };
  const hide = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const close = () => { pinned = false; hide(); };

  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !pinned) show();
  });
  btn.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pinned) hide();
  });
  btn.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) show(); else hide();
  });

  tooltips.add({ btn, pop, close });
}

/**
 * Hiển thị: "Có..." → dấu tick xanh, "Không" → dấu x đỏ.
 * Phần còn lại (dấu chú thích *, mô tả như "Microsoft (OIDC) only") giữ nguyên chữ.
 * Chữ gốc vẫn có cho trình đọc màn hình. Các giá trị khác (số, Unlimited, N/A) không đổi.
 */
function appendValue(td, v) {
  if (v === 'Không' || v.startsWith('Có')) {
    const yes = v !== 'Không';
    // Dấu chú thích (* † ‡) đã có ở nút chú thích bên cạnh, không lặp lại ở đây.
    const rest = yes ? v.slice(2).replace(/[*†‡]+/g, '').trim() : '';
    td.append(
      el('span', { class: yes ? 'ico ico-yes' : 'ico ico-no', 'aria-hidden': 'true' }, [
        document.createTextNode(yes ? '✓' : '✗')
      ]),
      el('span', { class: 'sr-only' }, [document.createTextNode(yes ? 'Có' : 'Không')])
    );
    if (rest) td.append(document.createTextNode(' ' + rest));
    return;
  }
  td.append(document.createTextNode(v));
}

function valueCell(cell, edition) {
  // N/A nhưng trang tính năng ghi là được hỗ trợ: đánh dấu nổi bật để khác ô N/A thường.
  const pageYes = cell.v === 'N/A' && cell.notes.some((n) => n.mark === '†');
  const td = el('td', { class: valueClass(cell.v) + (pageYes ? ' na-page' : ''), 'data-edition': edition });
  appendValue(td, cell.v);

  if (cell.notes.length) {
    const id = 'tip-' + ++tipCounter;
    const btn = el('button', {
      type: 'button',
      class: 'note-btn',
      'aria-expanded': 'false',
      'aria-controls': id,
      'aria-label': 'Chú thích'
    });
    btn.textContent = cell.notes.map((n) => n.mark).join('');
    const pop = el('span', { class: 'tip', role: 'tooltip', id, hidden: '' });
    cell.notes.forEach((n) => {
      const line = el('span', { class: 'tip-line' });
      line.textContent = (n.mark ? n.mark + ' ' : '') + (n.text || '(không có nội dung)');
      pop.append(line);
    });
    attachTooltip(btn, pop);
    td.append(btn);
  }
  return td;
}

/** Tiêu đề cột có thể bấm để sắp xếp. aria-sort cho trình đọc màn hình biết chiều hiện tại. */
function sortableHeader(label, key, sort, onSort) {
  const active = sort && sort.key === key;
  const th = el('th', { scope: 'col', 'aria-sort': active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none' });
  const btn = el('button', { type: 'button', class: 'sort-btn', 'data-key': key });
  btn.textContent = label;
  btn.addEventListener('click', () => onSort(key));
  th.append(btn);
  return th;
}

/**
 * Vẽ bảng. rows: dòng đã lọc và sắp xếp. editions: [{name, family}] đang hiển thị.
 * sort: { key, dir } hoặc null. onSort(key): gọi khi người dùng bấm tiêu đề.
 */
export function renderTable(table, rows, editions, sort, onSort) {
  clearTooltips(); // các ô cũ bị thay thế, gỡ chú thích cũ
  const head = el('tr', {}, [
    sortableHeader('Section', 'section', sort, onSort),
    sortableHeader('Feature', 'feature', sort, onSort),
    ...editions.map((e) => sortableHeader(e.label || e.name, e.name, sort, onSort))
  ]);
  const body = el('tbody');

  if (!rows.length) {
    const td = el('td', { class: 'empty', colspan: String(editions.length + 2) });
    td.textContent = 'Không có feature nào khớp bộ lọc.';
    body.append(el('tr', {}, [td]));
  }

  for (const r of rows) {
    const featureCell = el('td', { class: 'feature' });
    const [first, ...others] = r.links;
    if (first) {
      const a = el('a', { href: first.url, target: '_blank', rel: 'noopener noreferrer' });
      a.textContent = r.feature;
      featureCell.append(a);
    } else {
      featureCell.textContent = r.feature;
    }
    if (others.length) {
      // Link phụ ẩn sau nút mở rộng, không hiện mặc định để bảng khỏi rối.
      const more = el('details', { class: 'more-links' });
      const summary = el('summary');
      summary.textContent = `+${others.length} liên kết khác`;
      more.append(summary);
      others.forEach((l) => {
        const a = el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' });
        a.textContent = l.text;
        more.append(a);
      });
      featureCell.append(more);
    }
    if (r.subitems.length) {
      // Mục con của feature (các mục liệt kê trong ô tên trên trang Google), ẩn mặc định.
      const subs = el('details', { class: 'more-links' });
      const summary = el('summary');
      summary.textContent = `Mục con (${r.subitems.length})`;
      subs.append(summary);
      const list = el('ul', { class: 'subitems' });
      r.subitems.forEach((t) => {
        const li = el('li');
        li.textContent = t;
        list.append(li);
      });
      subs.append(list);
      featureCell.append(subs);
    }
    const tr = el('tr', {}, [
      el('td', { class: 'section' }, [document.createTextNode(r.section)]),
      featureCell,
      ...editions.map((e) => valueCell(cellOf(r, e.name), e.name))
    ]);
    body.append(tr);
  }

  table.replaceChildren(el('thead', {}, [head]), body);
}
