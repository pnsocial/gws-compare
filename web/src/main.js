import './style.css';
import { loadCatalog } from './cache.js';
import { flatten, filterRows, sortRows, sortSections } from './model.js';
import { renderTable } from './render.js';
import { readUrl, writeUrl } from './url.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => (d
  ? d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
  : 'chưa rõ');

let editions = [];
let rows = [];
let state = null;

function setStatus(msg) { $('status').textContent = msg; }

function buildControls(sections) {
  const families = [...new Set(editions.map((e) => e.family))];
  $('family').replaceChildren(
    new Option('Tất cả', ''),
    ...families.map((f) => new Option(f, f))
  );

  $('section').replaceChildren(
    new Option('Tất cả', ''),
    ...sections.map((s) => new Option(s.title, s.title))
  );

  const box = $('editions');
  box.querySelectorAll('label').forEach((l) => l.remove());
  for (const e of editions) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = e.name;
    input.dataset.family = e.family;
    input.checked = state.editions.has(e.name);
    const label = document.createElement('label');
    label.append(input, document.createTextNode(' ' + e.name));
    box.append(label);
  }
}

function syncFormFromState() {
  $('family').value = state.family;
  $('section').value = state.section;
  $('q').value = state.q;
  $('diff').checked = state.diff;
  document.querySelectorAll('#editions input').forEach((input) => {
    input.checked = state.editions.has(input.value);
    input.disabled = !!state.family && input.dataset.family !== state.family;
  });
}

function visibleEditions() {
  return editions.filter((e) =>
    (!state.family || e.family === state.family) && state.editions.has(e.name));
}

function apply() {
  const names = editions.map((e) => e.name);
  const visible = visibleEditions();
  writeUrl(state, names);
  syncFormFromState();

  if (!visible.length) {
    $('matrix').replaceChildren();
    setStatus('Chọn ít nhất một edition.');
    return;
  }
  const filtered = sortRows(filterRows(rows, state, visible), state.sort);
  renderTable($('matrix'), filtered, visible, state.sort, onSort);
  setStatus(`${filtered.length} / ${rows.length} feature`);
  $('reset').hidden = !filtersActive();
}

function filtersActive() {
  return !!(state.family || state.section || state.q.trim() || state.diff ||
    state.editions.size !== editions.length);
}

/** Xóa mọi bộ lọc, giữ nguyên thứ tự sắp xếp. */
function resetFilters() {
  state.family = '';
  state.section = '';
  state.q = '';
  state.diff = false;
  state.editions = new Set(editions.map((e) => e.name));
  apply();
}

/** Bấm tiêu đề: cột mới sắp tăng dần, bấm lại cùng cột thì đổi chiều. */
function onSort(key) {
  if (state.sort && state.sort.key === key) {
    state.sort = { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' };
  } else {
    state.sort = { key, dir: 'asc' };
  }
  apply();
}

function bindEvents() {
  $('family').addEventListener('change', (e) => {
    state.family = e.target.value;
    apply();
  });
  $('section').addEventListener('change', (e) => {
    state.section = e.target.value;
    apply();
  });
  $('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    apply();
  });
  $('reset').addEventListener('click', resetFilters);
  $('diff').addEventListener('change', (e) => {
    state.diff = e.target.checked;
    apply();
  });
  $('editions').addEventListener('change', (e) => {
    if (!e.target.matches('input')) return;
    if (e.target.checked) state.editions.add(e.target.value);
    else state.editions.delete(e.target.value);
    apply();
  });
}

async function init() {
  setStatus('Đang tải dữ liệu...');
  try {
    const data = await loadCatalog();
    editions = data.editions;
    const names = editions.map((e) => e.name);
    state = readUrl(names);

    const sections = sortSections(data.sections);
    rows = flatten(sections);
    buildControls(sections);
    bindEvents();
    apply();

    $('updated').textContent =
      `Dữ liệu được kiểm tra ngày ${fmtDate(data.checkedAt)}. ` +
      `Nội dung thay đổi lần gần nhất ngày ${fmtDate(data.changedAt)}. ` +
      `Tổng ${data.featureCount} feature.`;
  } catch (err) {
    setStatus('Không tải được dữ liệu: ' + err.message);
  }
}

init();
