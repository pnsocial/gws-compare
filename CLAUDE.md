# Google Workspace Compare Editions

Bàn giao từ phiên làm việc ngày 2026-11-26. Trả lời bằng tiếng Việt, ngắn gọn, có thể phản biện nhưng phải nêu luận điểm.

## Mục tiêu
Crawl tính năng theo edition của Google Workspace hàng ngày, tổng hợp thành ma trận, hiển thị trên website Firebase Hosting public có filter, link docs và tooltip chú thích.

```
Trigger → Apps Script → Google Sheet → Firestore → Web (Firebase Hosting)
```

## Quyết định đã chốt
- Không dùng BigQuery. Dùng Apps Script (không Cloud Run, không thư viện ngoài).
- Firestore + Firebase Hosting, public chỉ đọc.
- Đề xuất cho web: `firebase/firestore/lite`, App Check (reCAPTCHA Enterprise), Vite hoặc JS thuần.

## Tài nguyên
| Thứ | Giá trị |
|---|---|
| GCP/Firebase project | `phienbangws` |
| Firestore | `(default)`, Native, Standard, asia-southeast1 |
| Apps Script ID | `1c31Dm3f3mZxx5DMJ36kpBodJMFEMGTpWbEEFKNtiokc6iwSIZhnxArNM` |
| Nguồn | `https://knowledge.workspace.google.com/admin/getting-started/editions/compare-{business,enterprise,essentials,frontline}-editions?hl=en` |

Edition (theo thứ tự cột):
- Business: Starter, Standard, Plus
- Enterprise: Standard, Plus
- Essentials: Essentials Starter, Essentials, Enterprise Essentials, Enterprise Essentials Plus
- Frontline: Starter, Standard, Plus

## Apps Script
Mã nằm ở `apps-script/Code.gs` (khoảng 615 dòng) và `apps-script/appsscript.json`, do người dùng chép tay từ editor. Không dùng clasp. Nếu thiếu file hoặc thiếu hàm `publishFirestore_` thì dừng và yêu cầu người dùng chép lại; không viết lại từ mô tả.

- Hàm: `onOpen`, `crawl`, `rebuildMatrix`, `forcePublish`, `createDailyTrigger`.
- Scope: `spreadsheets`, `script.external_request`, `datastore`, `script.scriptapp`.
- Tab `raw`: family, section, group, feature, edition, value, source_key, url, links (JSON), notes (JSON). Ghi đè mỗi lần.
- Tab `map_feature`: source_key, feature_id, section, feature, first_seen. Người chỉnh tay, script chỉ thêm dòng.
- Tab `matrix`: Section, Feature (rich text link), 12 edition, Docs URL. Sinh tự động.
- Tab `log`: time, status, message.

### Quy tắc parser (đừng làm hỏng)
- Chỉ đọc `table.compare`, bỏ bảng add-on "AI Expanded Access".
- Dòng nhóm: chỉ một ô, hoặc ô đầu gộp cột và các ô còn lại rỗng.
- Dòng mà mọi giá trị rỗng là feature thật không được hỗ trợ. Giữ lại.
- Dòng in đậm (ví dụ "Argon") KHÔNG phải tiêu đề nhóm con. Đã từng là bug.
- Chú thích: các `<p>` sau bảng, trước `<table>` kế tiếp, tách theo `<br>`. Cùng ký hiệu khác nghĩa giữa các bảng.
- `N/A` (trang family không liệt kê) khác `Không`.
- Khóa trùng trong một family được thêm hậu tố ` #2`.
- Ngưỡng số feature tối thiểu: 250 / 300 / 230 / 260. Hiện tại: 322 / 396 / 300 / 330.
- Ghi Sheet dạng text và chặn công thức vì nội dung đến từ web.

## Schema Firestore (SCHEMA_VERSION = 1)
```
catalog/current
  schemaVersion, checkedAt, changedAt, featureCount
  editions: [{name, family}]
  hashes: {sectionId: sha256}
catalog/current/sections/{sectionId}
  title
  items: [{id, feature, links: [{text, url}],
           values: {<edition>: {v, n: [noteId]}}}]
  notes: {noteId: {mark, text}}
changes/{yyyyMMdd-HHmmss, UTC}
  createdAt, counts, added[], removed[], modified[]
```
- `v`: "Có", "Có*", "Không" hoặc chữ/số. Edition vắng trong `values` nghĩa là N/A.
- Section document **không có trường `order`**. Web sắp theo `title`.
- Checkpoint là `hashes` (theo từng section), không có trường `hash` đơn lẻ.
- Publish dừng nếu số feature bị xóa quá 10%; `forcePublish` bỏ qua chốt này.

## Trạng thái đã kiểm chứng
- Giá trị trong `raw` (3.948) và link ô feature khớp với trang nguồn.
- 465 feature, 31 section.
- Publish lần 1: 31/31 section; lần 2: 0/31. `changedAt` giữ nguyên, `checkedAt` cập nhật.
- CHƯA so từng trường trong section document với Sheet.
- Rules hiện tại: chặn toàn bộ (`allow read, write: if false`).
- Trigger hàng ngày: chưa xác nhận đã bật. Kiểm tra trong mục Triggers.

## Việc còn lại
1. `firestore.rules`: public đọc `catalog/{path=**}`, không ai ghi từ client, `changes/` vẫn chặn.
2. Web:
   - Filter theo family, edition, section, từ khóa; lưu filter trên URL.
   - "Chỉ hiện khác biệt" giữa các edition đang chọn (so cả `v` và chú thích; N/A hiển thị riêng).
   - Tên feature link sang docs (chỉ chấp nhận http/https, `rel="noopener noreferrer"`).
   - Tooltip chú thích gắn vào ô giá trị: hover, focus, click, Escape để đóng.
   - Cache theo `hashes`: đọc meta, chỉ tải lại section đã đổi, xóa section không còn.
   - Hiển thị `checkedAt`, link nguồn, ghi rõ không phải trang chính thức của Google.
   - Chỉ dùng `textContent`/DOM API, không `innerHTML` với dữ liệu.
3. Test rules bằng Emulator, bật App Check (monitor trước, enforce sau), budget alert.
4. Bật trigger và email báo lỗi.

## Nợ dữ liệu
- Feature trùng tên gần giống chưa gộp (khoảng 39 cặp nghi vấn). Ví dụ "Devices log events" / "Device log events", "Set space history…" / "Set spaces history…". Người duyệt rồi gộp qua `feature_id`; không gộp fuzzy tự động.
- `map_feature` còn khóa cũ chứa `gemini app argon > …` (vô hại). Giữ khóa kết thúc bằng `gemini app > argon`.
- 25 ô `**` của cột Essentials ở "Security Dashboard reports" không có nội dung chú thích.
- Chưa lấy link nằm trong ô giá trị và trong chú thích.
- Chưa xác nhận được phép đăng lại công khai nội dung của Google.

## Quy tắc làm việc
- Hỏi trước khi: deploy hosting/rules, chạy `forcePublish`, tạo trigger, xóa dữ liệu, ghi code vào Apps Script editor.
- Repo là nguồn chuẩn cho Apps Script. Trước khi sửa, hỏi người dùng xem editor có thay đổi chưa chép về không.
- Sau khi sửa, commit và nhắc người dùng dán vào editor. Chỉ để một tab editor, tải lại trước khi dán (tab cũ từng ghi đè code mới).
- Không commit secret hay file đăng nhập.
