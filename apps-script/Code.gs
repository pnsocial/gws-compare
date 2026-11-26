/**
 * Crawl 4 trang "Compare editions" của Google Workspace vào Google Sheet.
 * Không dùng thư viện ngoài.
 * Tab: raw (ghi đè), map_feature (người chỉnh), matrix (sinh tự động), log.
 */
const SHEET_ID = '1myfyzK5eqYefs6y3vZEKONqxYlX1zQnWW6N-AXPMAAY';
const BASE_URL = 'https://knowledge.workspace.google.com/admin/getting-started/editions/';
const TIMEZONE = 'Asia/Ho_Chi_Minh';

// Thứ tự ở đây là thứ tự cột trong matrix. minFeatures: ngưỡng phát hiện dữ liệu bất thường.
const FAMILIES = [
  { id: 'business', minFeatures: 250,
    editions: ['Business Starter', 'Business Standard', 'Business Plus'] },
  { id: 'enterprise', minFeatures: 300,
    editions: ['Enterprise Standard', 'Enterprise Plus'] },
  { id: 'essentials', minFeatures: 230,
    editions: ['Essentials Starter', 'Essentials', 'Enterprise Essentials', 'Enterprise Essentials Plus'] },
  { id: 'frontline', minFeatures: 260,
    editions: ['Frontline Starter', 'Frontline Standard', 'Frontline Plus'] }
];

const RAW_HEADER = ['family', 'section', 'group', 'feature', 'edition', 'value', 'source_key', 'url', 'links', 'notes', 'subitems'];

const FIRESTORE_PROJECT = 'phienbangws';
const FIRESTORE_DB = '(default)';
const SCHEMA_VERSION = 1; // tăng khi đổi cấu trúc document
const MAX_REMOVED_RATIO = 0.1; // chặn publish nếu mất quá 10% feature
const SOURCE_ORIGIN = 'https://knowledge.workspace.google.com';
const MAP_HEADER = ['source_key', 'feature_id', 'section', 'feature', 'first_seen'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Workspace Editions')
    .addItem('Crawl ngay', 'crawl')
    .addItem('Dựng lại matrix (sau khi sửa map_feature)', 'rebuildMatrix')
    .addSeparator()
    .addItem('Bật lịch chạy hàng ngày', 'createDailyTrigger')
    .addToUi();
}

/** Hàm chính: tải, kiểm tra đủ 4 family rồi mới ghi. */
function crawl() {
  withLock_(function (ss) {
    const responses = UrlFetchApp.fetchAll(FAMILIES.map(function (f) {
      return {
        url: BASE_URL + 'compare-' + f.id + '-editions?hl=en',
        headers: { 'Accept-Language': 'en' },
        muteHttpExceptions: true
      };
    }));

    const raw = [];
    const summary = responses.map(function (res, i) {
      const family = FAMILIES[i];
      const status = res.getResponseCode();
      if (status !== 200) throw new Error(family.id + ': HTTP ' + status);

      const features = parsePage_(res.getContentText('UTF-8'), family);
      if (features.length < family.minFeatures) {
        throw new Error(family.id + ': chỉ có ' + features.length + ' feature');
      }
      const seenEditions = new Set();
      features.forEach(function (f) {
        f.values.forEach(function (v) {
          seenEditions.add(v.edition);
          raw.push([family.id, f.section, f.group, f.feature, v.edition, v.value, f.key,
            f.links.length ? f.links[0].url : '', JSON.stringify(f.links), JSON.stringify(v.notes),
            JSON.stringify(f.subitems)]);
        });
      });
      const missing = family.editions.filter(function (e) { return !seenEditions.has(e); });
      if (missing.length) throw new Error(family.id + ': thiếu edition ' + missing.join(', '));
      return family.id + '=' + features.length;
    });

    const result = buildMatrix_(ss, raw);
    writeTable_(ss, 'raw', [RAW_HEADER].concat(raw));
    saveMatrix_(ss, result);
    const published = publishAfterSheet_(result.records, { checked: true });
    return summary.join(', ') + '; khóa mới: ' + result.added.length + '; ' + published;
  });
}

/** Dựng lại matrix từ tab raw, không tải lại web. */
function rebuildMatrix() {
  rebuild_(false);
}

/** Chỉ dùng khi đã kiểm tra và chấp nhận việc nhiều feature bị xóa (ví dụ sau khi gộp dòng). */
function forcePublish() {
  rebuild_(true);
}

function rebuild_(force) {
  withLock_(function (ss) {
    const sheet = ss.getSheetByName('raw');
    if (!sheet || sheet.getLastRow() < 2) throw new Error('Tab raw chưa có dữ liệu, hãy chạy crawl trước');
    const raw = sheet.getDataRange().getValues().slice(1);
    const result = buildMatrix_(ss, raw);
    saveMatrix_(ss, result);
    const published = publishAfterSheet_(result.records, { checked: false, force: force });
    return 'rebuild: ' + (result.matrix.length - 1) + ' dòng; ' + published;
  });
}

/** Chạy một lần để đặt lịch khoảng 6-7 giờ sáng mỗi ngày. */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'crawl'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('crawl').timeBased().everyDays(1).atHour(6).inTimezone(TIMEZONE).create();
}

/* ---------- Parser ---------- */

function parsePage_(html, family) {
  const tokenRe = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>|<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  const features = [];
  const seen = new Map();
  let section = '';
  let match;

  while ((match = tokenRe.exec(html))) {
    if (match[1]) { section = text_(match[2]); continue; }
    if (!/class\s*=\s*["']?[^"'>]*\bcompare\b/i.test(match[3])) continue;

    const rows = rows_(match[4]);
    if (!rows.length) continue;
    const head = rows[0].slice(1).map(function (c) { return c.text.replace(/[*†]/g, '').trim(); });
    // Bảng add-on, không thuộc so sánh edition
    if (head.some(function (h) { return h.indexOf('AI Expanded Access') >= 0; })) continue;
    const unknown = head.filter(function (h) { return family.editions.indexOf(h) < 0; });
    if (unknown.length) throw new Error(family.id + ': edition lạ "' + unknown.join(', ') + '"');

    // Chú thích nằm sau bảng, trước bảng kế tiếp; cùng ký hiệu có thể khác nghĩa giữa các bảng
    const after = html.slice(tokenRe.lastIndex);
    const end = after.search(/<table\b/i);
    const notes = footnotes_(end < 0 ? after : after.slice(0, end));
    const rawHead = rows[0].slice(1).map(function (c) { return c.text; });

    let group = '';
    rows.slice(1).forEach(function (cells) {
      if (cells.every(function (c) { return !c.text; })) return;
      const first = cells[0];
      const rest = cells.slice(1);
      const empty = rest.every(function (c) { return !c.text; });

      // Tiêu đề nhóm: một ô, hoặc ô đầu gộp cột
      if (!rest.length || (first.span > 1 && empty)) { group = first.text; return; }

      const values = [];
      rest.forEach(function (c) {
        for (let k = 0; k < c.span; k++) values.push(c.text);
      });
      if (!first.text || values.length !== head.length) {
        throw new Error(family.id + ': dòng sai cấu trúc ở "' + section + ' / ' + first.text + '"');
      }

      let key = keyOf_([section, group, first.text]);
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 1) key += ' #' + count;

      const parts = first.html.split(/<(?:ul|ol)\b/i);
      const subitems = Array.from(first.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi), function (m) {
        return text_(m[1]);
      }).filter(function (t) { return t; });

      features.push({
        section: section, group: group, feature: text_(parts[0]), subitems: subitems,
        key: key, links: links_(first.html),
        values: head.map(function (edition, i) {
          return { edition: edition, value: values[i],
            notes: notesFor_(notes, [rawHead[i], group, first.text, values[i]]) };
        })
      });
    });
  }
  return features;
}

function rows_(tableHtml) {
  return Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), function (tr) {
    return Array.from(tr[1].matchAll(/<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/gi), function (c) {
      const span = c[2].match(/colspan\s*=\s*["']?(\d+)/i);
      return { html: c[3], span: span ? Number(span[1]) : 1, text: text_(c[3]) };
    });
  }).filter(function (r) { return r.length; });
}

/** Đọc các đoạn <p> bắt đầu bằng *, †, ‡; mỗi dòng (ngăn bởi <br>) là một chú thích. */
function footnotes_(html) {
  const notes = {};
  let last = '';
  Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)).forEach(function (p) {
    if (!/^[*†‡]/.test(text_(p[1]))) return;
    p[1].split(/<br\s*\/?>/i).forEach(function (line) {
      const s = text_(line);
      const m = s.match(/^(\*+|†+|‡+)\s*(.*)/);
      if (m) { last = m[1]; notes[last] = m[2]; }
      else if (s && last) notes[last] += ' ' + s;
    });
  });
  return notes;
}

function notesFor_(notes, texts) {
  const marks = [];
  texts.forEach(function (t) {
    (String(t).match(/\*+|†+|‡+/g) || []).forEach(function (mark) {
      if (marks.indexOf(mark) < 0) marks.push(mark);
    });
  });
  return marks.map(function (mark) { return { mark: mark, text: notes[mark] || '' }; });
}

/** Link docs trong ô tên feature; bỏ link neo nội bộ (#...). */
function links_(cellHtml) {
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  return Array.from(cellHtml.matchAll(re), function (m) {
    return { text: text_(m[3]), url: url_(m[1] || m[2] || '') };
  }).filter(function (l) { return l.url; });
}

/** Chỉ chấp nhận http(s); đường dẫn gốc được ghép với domain nguồn. */
function url_(href) {
  const h = text_(href);
  if (/^https?:\/\//i.test(h)) return h;
  if (h.indexOf('//') === 0) return 'https:' + h;
  if (h.charAt(0) === '/') return SOURCE_ORIGIN + h;
  return '';
}

function text_(html) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    dagger: '†', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®', copy: '©' };
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e.charAt(0) !== '#') return named[e.toLowerCase()] || m;
      return String.fromCodePoint(e.charAt(1).toLowerCase() === 'x'
        ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Matrix ---------- */

function keyOf_(parts) {
  return parts.map(function (s) {
    return String(s).toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/administrator/g, 'admin')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }).join(' > ');
}

function status_(value) {
  const v = String(value).trim();
  if (v.charAt(0) === '✔') return 'Có' + v.slice(1);
  return ['', '–', '-'].indexOf(v) >= 0 ? 'Không' : v;
}

/** Chỉ tính toán trong bộ nhớ; lỗi ở đây thì chưa có gì bị ghi đè. */
function buildMatrix_(ss, raw) {
  const editions = FAMILIES.reduce(function (a, f) { return a.concat(f.editions); }, []);
  const mapSheet = ss.getSheetByName('map_feature');
  const mapped = new Map();
  if (mapSheet && mapSheet.getLastRow() > 1) {
    mapSheet.getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[0]) mapped.set(String(r[0]), r);
    });
  }

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const added = [];
  const rows = new Map();
  const docs = new Map();
  const cells = new Map();
  const names = new Map();
  const subs = new Map();

  raw.forEach(function (r) {
    const section = r[1], group = r[2], feature = r[3], edition = r[4], value = r[5], key = String(r[6]);
    let m = mapped.get(key);
    if (!m) {
      m = [key, key, section, group ? group + ': ' + feature : feature, today];
      mapped.set(key, m);
      added.push(m);
    }
    const id = String(m[1] || key);
    if (!names.has(id)) names.set(id, group ? group + ': ' + feature : feature);
    if (!subs.has(id) && r[10] && r[10] !== '[]') subs.set(id, JSON.parse(r[10]));
    if (!rows.has(id)) {
      rows.set(id, [m[2], names.get(id)].concat(editions.map(function () { return 'N/A'; })));
    }
    const row = rows.get(id);
    // Khi gộp nhiều family, lấy link của dòng đầu tiên có link (theo thứ tự FAMILIES)
    if (!docs.has(id) && r[8] && r[8] !== '[]') docs.set(id, JSON.parse(r[8]));
    const col = 2 + editions.indexOf(edition);
    if (col < 2) throw new Error('Edition chưa khai báo: ' + edition);
    const next = status_(value);
    if (row[col] !== 'N/A' && row[col] !== next) {
      throw new Error('Xung đột giá trị khi gộp: ' + id + ' / ' + edition);
    }
    row[col] = next;
    if (!cells.has(id)) cells.set(id, {});
    cells.get(id)[edition] = { v: next, notes: r[9] ? JSON.parse(r[9]) : [] };
  });

  const ids = Array.from(rows.keys()).sort(function (a, b) {
    return String(rows.get(a)[0]).localeCompare(String(rows.get(b)[0]));
  });
  const links = ids.map(function (id) { return docs.get(id) || []; });
  const body = ids.map(function (id, i) {
    return rows.get(id).concat([links[i].length ? links[i][0].url : '']);
  });
  const header = ['Section', 'Feature'].concat(editions, ['Docs URL']);
  const records = ids.map(function (id, i) {
    return { id: id, section: String(rows.get(id)[0]), feature: String(rows.get(id)[1]),
      links: links[i], subitems: subs.get(id) || [], values: cells.get(id) };
  });
  return { matrix: [header].concat(body), links: links, added: added, records: records };
}

function saveMatrix_(ss, result) {
  // map_feature chỉ thêm dòng mới, không ghi đè phần đã chỉnh tay
  const map = ss.getSheetByName('map_feature') || ss.insertSheet('map_feature');
  if (map.getLastRow() === 0) {
    writeRows_(map, 1, [MAP_HEADER]);
    map.setFrozenRows(1);
  }
  if (result.added.length) writeRows_(map, map.getLastRow() + 1, result.added);

  const sheet = writeTable_(ss, 'matrix', result.matrix);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 420);
  const area = sheet.getRange(1, 1, result.matrix.length, result.matrix[0].length);
  area.createFilter();
  // Gắn link vào ô Feature
  sheet.getRange(2, 2, result.matrix.length - 1, 1).setRichTextValues(
    result.matrix.slice(1).map(function (row, i) {
      return [richText_(String(row[1]), result.links[i])];
    }));
  const values = sheet.getRange(2, 3, result.matrix.length - 1, result.matrix[0].length - 3);
  const rule = function (builder, color) { return builder.setBackground(color).setRanges([values]).build(); };
  sheet.setConditionalFormatRules([
    rule(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Có'), '#d9ead3'),
    rule(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Không'), '#f4cccc'),
    rule(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('N/A'), '#eeeeee')
  ]);
}

/** Một link: cả ô bấm được. Nhiều link: gắn vào đúng đoạn chữ tương ứng. */
function richText_(text, links) {
  const builder = SpreadsheetApp.newRichTextValue().setText(text);
  if (links.length === 1) builder.setLinkUrl(links[0].url);
  if (links.length > 1) {
    let from = 0;
    let matched = 0;
    links.forEach(function (l) {
      const at = l.text ? text.indexOf(l.text, from) : -1;
      if (at < 0) return;
      builder.setLinkUrl(at, at + l.text.length, l.url);
      from = at + l.text.length;
      matched++;
    });
    if (!matched) builder.setLinkUrl(links[0].url);
  }
  return builder.build();
}

/* ---------- Firestore ---------- */

function publishAfterSheet_(records, options) {
  try {
    return publishFirestore_(records, options);
  } catch (err) {
    throw new Error('Sheet đã cập nhật, Firestore lỗi: ' + err.message);
  }
}

/**
 * Checkpoint là map hashes trong catalog/current: chỉ ghi section thay đổi.
 * Mọi thay đổi đi trong một lệnh commit nên không có trạng thái dở dang.
 */
function publishFirestore_(records, options) {
  const root = 'projects/' + FIRESTORE_PROJECT + '/databases/' + FIRESTORE_DB + '/documents';
  const metaName = root + '/catalog/current';
  const sectionName = function (id) { return metaName + '/sections/' + id; };

  const sections = buildSections_(records);
  const metaDoc = fsRequest_(metaName, null, true);
  const old = metaDoc ? fromFields_(metaDoc.fields || {}) : null;
  const oldHashes = (old && old.hashes) || {};

  const hashes = {};
  sections.forEach(function (s) {
    hashes[s.id] = hash_(stable_([SCHEMA_VERSION, s.doc]));
  });
  const changed = sections.filter(function (s) { return oldHashes[s.id] !== hashes[s.id]; });
  const removed = Object.keys(oldHashes).filter(function (id) { return !hashes[id]; });
  const dirty = changed.length > 0 || removed.length > 0;

  const writes = changed.map(function (s) {
    return { update: { name: sectionName(s.id), fields: fields_(s.doc) } };
  }).concat(removed.map(function (id) { return { delete: sectionName(id) }; }));
  const now = new Date();

  if (old && dirty) {
    const wanted = changed.filter(function (s) { return oldHashes[s.id]; })
      .map(function (s) { return s.id; }).concat(removed).map(sectionName);
    const oldDocs = wanted.length
      ? fsRequest_(root + ':batchGet', { documents: wanted })
        .filter(function (x) { return x.found; })
        .map(function (x) { return fromFields_(x.found.fields || {}); })
      : [];
    const diff = changes_(oldDocs, changed.map(function (s) { return s.doc; }), sections);
    if (!options.force && diff.removed.length > old.featureCount * MAX_REMOVED_RATIO) {
      throw new Error('Dừng publish: ' + diff.removed.length + ' feature bị xóa. Kiểm tra rồi chạy forcePublish');
    }
    writes.push({ update: {
      name: root + '/changes/' + Utilities.formatDate(now, 'UTC', 'yyyyMMdd-HHmmss'),
      fields: fields_({
        createdAt: now,
        counts: { added: diff.added.length, removed: diff.removed.length, modified: diff.modified.length },
        added: diff.added.slice(0, 500),
        removed: diff.removed.slice(0, 500),
        modified: diff.modified.slice(0, 500)
      })
    } });
  }

  const editions = [];
  FAMILIES.forEach(function (f) {
    f.editions.forEach(function (name) { editions.push({ name: name, family: f.id }); });
  });
  writes.push({ update: { name: metaName, fields: fields_({
    schemaVersion: SCHEMA_VERSION,
    checkedAt: !options.checked && old && old.checkedAt ? new Date(old.checkedAt) : now,
    changedAt: !dirty && old && old.changedAt ? new Date(old.changedAt) : now,
    featureCount: records.length,
    editions: editions,
    hashes: hashes
  }) } });

  fsRequest_(root + ':commit', { writes: writes });
  return 'Firestore: ghi ' + changed.length + '/' + sections.length + ' section, xóa ' + removed.length;
}

/** Gom theo section; chú thích lưu một lần mỗi document, ô giá trị chỉ giữ ID. */
function buildSections_(records) {
  const cache = new Map();
  const shortId = function (s) {
    if (!cache.has(s)) cache.set(s, hash_(s).slice(0, 16));
    return cache.get(s);
  };
  const bySection = new Map();
  records.forEach(function (r) {
    if (!bySection.has(r.section)) bySection.set(r.section, { title: r.section, items: [], notes: {} });
    const doc = bySection.get(r.section);
    const values = {};
    Object.keys(r.values).forEach(function (edition) {
      const cell = r.values[edition];
      values[edition] = { v: cell.v, n: cell.notes.map(function (note) {
        const id = shortId(note.mark + '|' + note.text);
        doc.notes[id] = { mark: note.mark, text: note.text };
        return id;
      }) };
    });
    // Edition không có trong values nghĩa là N/A
    doc.items.push({ id: shortId(r.id), feature: r.feature, links: r.links, subitems: r.subitems, values: values });
  });
  return Array.from(bySection.values()).map(function (doc) {
    return { id: shortId(doc.title), doc: doc };
  });
}

function changes_(oldDocs, newDocs, allSections) {
  const index = function (docs) {
    const map = new Map();
    docs.forEach(function (d) {
      (d.items || []).forEach(function (item) {
        map.set(item.id, { label: d.title + ' / ' + item.feature, sig: stable_([d.title, item]) });
      });
    });
    return map;
  };
  const before = index(oldDocs);
  const after = index(newDocs);
  const all = index(allSections.map(function (s) { return s.doc; }));
  const result = { added: [], removed: [], modified: [] };
  after.forEach(function (v, id) {
    if (!before.has(id)) result.added.push(v.label);
    else if (before.get(id).sig !== v.sig) result.modified.push(v.label);
  });
  before.forEach(function (v, id) {
    if (!all.has(id)) result.removed.push(v.label);
  });
  return result;
}

function fsRequest_(path, body, allowMissing) {
  const options = {
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  };
  if (body) {
    options.method = 'post';
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + path, options);
  const code = res.getResponseCode();
  if (code === 404 && allowMissing) return null;
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    let message = text.slice(0, 500);
    try { message = JSON.parse(text).error.message; } catch (e) { /* giữ nguyên nội dung gốc */ }
    throw new Error('HTTP ' + code + ': ' + message);
  }
  return JSON.parse(text);
}

function value_(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value_) } };
  return { mapValue: { fields: fields_(v) } };
}

function fields_(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) { out[k] = value_(obj[k]); });
  return out;
}

function fromValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue_);
  if ('mapValue' in v) return fromFields_(v.mapValue.fields || {});
  return null;
}

function fromFields_(fields) {
  const out = {};
  Object.keys(fields).forEach(function (k) { out[k] = fromValue_(fields[k]); });
  return out;
}

/** JSON với khóa đã sắp xếp: Firestore không giữ thứ tự khóa của map. */
function stable_(v) {
  if (Array.isArray(v)) return '[' + v.map(stable_).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stable_(v[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(v);
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return (b & 255).toString(16).padStart(2, '0'); }).join('');
}

/* ---------- Tiện ích Sheet ---------- */

function writeTable_(ss, name, table) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clearContents();
  writeRows_(sheet, 1, table);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, table[0].length).setFontWeight('bold');
  return sheet;
}

function writeRows_(sheet, startRow, rows) {
  const lastRow = startRow + rows.length - 1;
  const width = rows[0].length;
  if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  // Nội dung từ web: ép dạng text, chặn công thức và tự đổi "1-300" thành ngày
  const safe = rows.map(function (r) {
    return r.map(function (v) {
      const s = String(v);
      return /^[=+]/.test(s) ? "'" + s : s;
    });
  });
  sheet.getRange(startRow, 1, safe.length, width).setNumberFormat('@').setValues(safe);
}

function withLock_(task) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  try {
    log_(ss, 'OK', task(ss));
  } catch (err) {
    log_(ss, 'LỖI', err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function log_(ss, status, message) {
  const sheet = ss.getSheetByName('log') || ss.insertSheet('log');
  if (sheet.getLastRow() === 0) writeRows_(sheet, 1, [['time', 'status', 'message']]);
  const now = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  writeRows_(sheet, sheet.getLastRow() + 1, [[now, status, message]]);
}
