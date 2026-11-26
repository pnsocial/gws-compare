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

/** Tooltip chú thích: hover, focus, click để ghim, Escape để đóng. */
function attachTooltip(btn, pop) {
  let pinned = false;
  const show = () => { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const hide = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('mouseenter', show);
  btn.addEventListener('mouseleave', () => { if (!pinned) hide(); });
  btn.addEventListener('focus', show);
  btn.addEventListener('blur', () => { if (!pinned) hide(); });
  btn.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) show(); else hide();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { pinned = false; hide(); }
  });
}

function valueCell(cell, edition) {
  const td = el('td', { class: valueClass(cell.v), 'data-edition': edition });
  td.append(document.createTextNode(cell.v));

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
    td.append(btn, pop);
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
  const head = el('tr', {}, [
    sortableHeader('Section', 'section', sort, onSort),
    sortableHeader('Feature', 'feature', sort, onSort),
    ...editions.map((e) => sortableHeader(e.name, e.name, sort, onSort))
  ]);
  const body = el('tbody');

  for (const r of rows) {
    const featureCell = el('td', { class: 'feature' });
    if (r.link) {
      const a = el('a', { href: r.link, target: '_blank', rel: 'noopener noreferrer' });
      a.textContent = r.feature;
      featureCell.append(a);
    } else {
      featureCell.textContent = r.feature;
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
