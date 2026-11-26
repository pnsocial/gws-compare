import './style.css';
import { loadCatalog } from './cache.js';
import { flatten, filterRows, sortRows, sortSections, toCsv } from './model.js';

const FAMILY_LABELS = { business: 'Business', enterprise: 'Enterprise', essentials: 'Essentials', frontline: 'Frontline' };
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
  updatePresets();
}

function buildPresets() {
  const families = [...new Set(editions.map((e) => e.family))];
  const make = (label, family) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.family = family;
    b.addEventListener('click', () => selectPreset(family));
    return b;
  };
  $('presets').replaceChildren(
    make('Tất cả', ''),
    ...families.map((f) => make(FAMILY_LABELS[f] || f, f))
  );
}

/** Chọn đúng các edition của một family (hoặc tất cả nếu family rỗng). */
function selectPreset(family) {
  state.family = '';
  state.editions = new Set(editions.filter((e) => !family || e.family === family).map((e) => e.name));
  apply();
}

function updatePresets() {
  document.querySelectorAll('#presets button').forEach((b) => {
    const f = b.dataset.family;
    const want = editions.filter((e) => !f || e.family === f).map((e) => e.name);
    const on = want.length === state.editions.size && want.every((n) => state.editions.has(n));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** Tải CSV đúng với kết quả đang hiển thị (lọc, sắp xếp, edition đang chọn). */
function downloadCsv() {
  const visible = visibleEditions();
  const out = sortRows(filterRows(rows, state, visible), state.sort);
  const blob = new Blob(['﻿' + toCsv(out, visible)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gws-compare-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  $('csv').addEventListener('click', downloadCsv);
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
    buildPresets();
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
