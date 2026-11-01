# HRVS Multi-image QA Studio

Web độc lập tham khảo luồng QA của `../hrvs_annotation_platform`. Nhận hai folder GT / OtherImages qua trình duyệt, không cần backend hay API key. Ảnh và annotations được lưu cục bộ bằng IndexedDB, không được upload lên hosting.

## Chạy local

```bash
cd /home/ubuntu/workspace/density/hrvs_multiimage_qa
python3 -m http.server 8791 --bind 127.0.0.1 --directory dist
```

Mở http://localhost:8791 bằng Chrome / Edge. Dùng HTTPS hoặc localhost để SHA-256 và lưu trữ hoạt động. Khi chạy server từ máy khác, cần HTTPS hoặc SSH forwarding đến localhost.

## Quy trình

1. Chọn folder GT và folder OtherImages (đọc cả thư mục con). File giống hệt được gộp bằng SHA-256; ảnh GT bị loại khỏi pool của chính nó. Không tự upscale ảnh. Ảnh lỗi/định dạng không hỗ trợ không được nhập.
2. Chọn GT, nhập annotator, question / answer tiếng Anh và question / answer type. Spatial cần 1–2 mô tả discrete reference objects. Bbox reference là optional trong guideline và không bắt buộc trong bản này.
3. Cuộn để zoom; chọn Di chuyển để pan. Kéo vẽ một target bbox. Bbox diện tích >= 0.1%, rỗng hoặc ngoài ảnh không được chấp nhận. Tính trên kích thước ảnh decode gốc; không dùng thumbnail. Cần bao trọn phần nhìn thấy của target.
4. Pool 100 ảnh riêng cho từng GT. Shuffle ưu tiên ảnh chưa có trong pool trước, giữ 19 ảnh đã chọn. Nếu nguồn không đủ 100, hiển thị tất cả ảnh còn lại và thông báo số thực tế; nguồn ít thì các pool có thể trùng. Ảnh đã chọn được hiển thị riêng ở đầu grid, không chiếm pool sau shuffle.
5. Mở mỗi ảnh, zoom/pan kiểm tra, rồi xác nhận không thể trả lời Q. Chọn đúng 19; không có chọn hàng loạt. Sửa Q/A, type, references hay bbox hủy tất cả xác nhận và đưa sample về draft.
6. Hoàn thành 5 checklist rồi Lưu hoàn tất. Một record cho mỗi GT. Không tự xác minh ngữ nghĩa hoặc K=1 bằng máy; annotator chịu trách nhiệm xác nhận. Phần mềm chặn số lượng, bbox, IDs, thiếu review, một số mẫu Count/Yes–No; checklist bao quát English, OCR, cues và chất lượng thị giác.
7. Export sample hoặc toàn bộ sample hoàn tất thành file JSON, không kèm ảnh. Manifest chứa ID, tên và source_path để đối chiếu ảnh gốc.

## Lưu trữ và backup

Mỗi trình duyệt/origin có workspace riêng, không có đồng bộ đa annotator trên server. Tiến độ tự lưu sau thay đổi. Dung lượng phụ thuộc quota trình duyệt; khi hết dung lượng có thông báo lỗi. Không xóa site data trước khi export. Backup JSON giữ annotations, pool và manifest; để khôi phục trên máy khác cần nhập lại cùng folder ảnh, rồi chọn backup. Backup trùng GT sẽ yêu cầu xác nhận ghi đè.

SHA-256 chỉ nhận diện file giống byte; ảnh crop/resize/re-encode vẫn cần annotator tự loại. Không cố dùng thuật toán kiểm tra ngôn ngữ hay semantic K=1 thay người.

## Kiểm thử

```bash
node --test test.mjs
node --check dist/app.mjs
```

`test.mjs` kiểm tra strict bbox threshold, sampling, 19 IDs/review/checklist, Spatial, banned forms và ZIP. Đã kiểm thử Chromium end-to-end với ảnh giả lập: import folders, draw/reject, shuffle, chọn 19, complete/export, reload, invalidation, GT isolation, responsive.

## Backup local tự động

Bấm **Bật / tiếp tục backup local**, chọn thư mục và cấp quyền ghi một lần trên Chrome/Edge desktop. Web lưu handle trong IndexedDB và tự cập nhật `hrvs_workspace_backup.json` sau 600 ms khi annotation/pool/dataset thay đổi, bao gồm cả draft. Ghi file được tuần tự và dùng createWritable để thay thế file sau khi ghi thành công. Có trạng thái lần lưu cuối và thông báo khi lỗi/quyền bị thu hồi. Khi mở lại, bấm tiếp tục nếu trình duyệt yêu cầu cấp lại quyền. Trình duyệt không hỗ trợ File System Access vẫn tự lưu IndexedDB và có backup thủ công. Backup không chứa ảnh.
