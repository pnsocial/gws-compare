import './style.css';
import { loadCatalog } from './cache.js';
import { flatten, filterRows, sortRows, sortSections, toCsv, FAMILY_LABELS, groupOf } from './model.js';
import { renderTable } from './render.js';
import { readUrl, writeUrl } from './url.js';
import { loadExtras } from './extras.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => (d
  ? d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
  : 'chưa rõ');

let editions = [];
let defaultNames = [];
let rows = [];
let state = null;

const isExtra = (e) => groupOf(e.family) !== 'workspace';

function setStatus(msg) { $('status').textContent = msg; }

function sameSet(set, arr) {
  return set.size === arr.length && arr.every((n) => set.has(n));
}

function buildControls(sections) {
  const families = [...new Set(editions.map((e) => e.family))];
  $('family').replaceChildren(
    new Option('Tất cả', ''),
    ...families.map((f) => new Option(FAMILY_LABELS[f] || f, f))
  );

  $('section').replaceChildren(
    new Option('Tất cả', ''),
    ...sections.map((s) => new Option(s.title, s.title))
  );

  const box = $('editions');
  const extraBox = $('extra-editions');
  box.querySelectorAll('label').forEach((l) => l.remove());
  extraBox.replaceChildren();
  for (const e of editions) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = e.name;
    input.dataset.family = e.family;
    input.checked = state.editions.has(e.name);
    const label = document.createElement('label');
    label.append(input, document.createTextNode(' ' + (e.label || e.name)));
    (isExtra(e) ? extraBox : box).append(label);
  }
  $('extras').hidden = !editions.some(isExtra);
}

function syncFormFromState() {
  $('family').value = state.family;
  $('section').value = state.section;
  $('q').value = state.q;
  $('diff').checked = state.diff;
  document.querySelectorAll('#editions input, #extra-editions input').forEach((input) => {
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
  writeUrl(state, names, defaultNames);
  syncFormFromState();

  if (!visible.length) {
    $('matrix').replaceChildren();
    setStatus('Chọn ít nhất một edition.');
    return;
  }
  const filtered = sortRows(filterRows(rows, state, visible), state.sort);
  renderTable($('matrix'), filtered, visible, state.sort, onSort);
  // Tổng chỉ đếm feature thuộc nhóm đang chọn (Workspace hoặc nhóm mở rộng).
  const groups = new Set(editions.filter((e) => state.editions.has(e.name)).map((e) => groupOf(e.family)));
  const total = rows.filter((r) => groups.has(groupOf(r.family))).length;
  setStatus(`${filtered.length} / ${total} feature`);
  $('reset').hidden = !filtersActive();
  updatePresets();
}

function buildPresets() {
  const make = (label, family) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.family = family;
    b.addEventListener('click', () => selectPreset(family));
    return b;
  };
  // "Tất cả" chỉ áp cho Google Workspace; nhóm mở rộng có nút riêng.
  const workspaceFamilies = [...new Set(editions.filter((e) => !isExtra(e)).map((e) => e.family))];
  const extraFamilies = [...new Set(editions.filter(isExtra).map((e) => e.family))];
  $('presets').replaceChildren(
    make('Tất cả', ''),
    ...workspaceFamilies.map((f) => make(FAMILY_LABELS[f] || f, f))
  );
  $('extra-presets').replaceChildren(
    ...extraFamilies.map((f) => make(FAMILY_LABELS[f] || f, f))
  );
}

/** Các edition của một nút nhanh. family rỗng = toàn bộ edition Google Workspace. */
function presetNames(family) {
  if (!family) return defaultNames;
  return editions.filter((e) => e.family === family).map((e) => e.name);
}

function selectPreset(family) {
  state.family = '';
  state.editions = new Set(presetNames(family));
  apply();
}

function updatePresets() {
  document.querySelectorAll('#presets button, #extra-presets button').forEach((b) => {
    b.setAttribute('aria-pressed', sameSet(state.editions, presetNames(b.dataset.family)) ? 'true' : 'false');
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
    !sameSet(state.editions, defaultNames));
}

/** Xóa mọi bộ lọc, giữ nguyên thứ tự sắp xếp. */
function resetFilters() {
  state.family = '';
  state.section = '';
  state.q = '';
  state.diff = false;
  state.editions = new Set(defaultNames);
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

function onEditionChange(e) {
  if (!e.target.matches('input')) return;
  if (e.target.checked) state.editions.add(e.target.value);
  else state.editions.delete(e.target.value);
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
  $('editions').addEventListener('change', onEditionChange);
  $('extra-editions').addEventListener('change', onEditionChange);
}

/**
 * Nút thu gọn/mở rộng khối bộ lọc. Trên màn hình hẹp (điện thoại) mặc định thu gọn
 * để bảng hiện nhiều hơn. Trạng thái không lưu lên URL.
 */
function setupFilterToggle() {
  const btn = $('toggle-filters');
  const body = $('filter-body');
  const narrow = window.matchMedia('(max-width: 600px)').matches;
  const setOpen = (open) => {
    body.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Thu gọn' : 'Mở bộ lọc';
  };
  setOpen(!narrow);
  btn.addEventListener('click', () => setOpen(body.hidden));
}

async function init() {
  setStatus('Đang tải dữ liệu...');
  try {
    const data = await loadCatalog();
    const extras = await loadExtras();
    editions = data.editions.concat(extras.editions);
    const allSections = data.sections.concat(extras.sections);
    const names = editions.map((e) => e.name);
    defaultNames = editions.filter((e) => !isExtra(e)).map((e) => e.name);
    state = readUrl(names, defaultNames);

    const sections = sortSections(allSections);
    rows = flatten(sections);
    buildControls(sections);
    buildPresets();
    setupFilterToggle();
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
