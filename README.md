# HRVS Multi-image QA Studio

Công cụ annotate Q&A cho bài toán multi-image visual search: mỗi sample gồm **1 ảnh GT và 19 OtherImages**, với **K = 1, N = 20**. Ứng dụng hỗ trợ vẽ target bbox trên ảnh gốc, kiểm tra từng OtherImage, theo dõi trạng thái GT và tự backup annotation vào `./backup`.

## Chạy ứng dụng

Yêu cầu **Python 3.9 trở lên** và trình duyệt Chrome hoặc Edge. Không cần cài thư viện Python hoặc API key.

```bash
git clone https://github.com/fonzi22/hrvs_multi_images_annotation.git
cd hrvs_multi_images_annotation
python server.py --port 8791 --bind 127.0.0.1
```

Mở **http://localhost:8791**. Nếu repo đã nằm trong thư mục `hrvs_multiimage_qa`, chạy lệnh `python server.py` từ thư mục đó.

Dùng `server.py` để có cả giao diện và API backup. `python -m http.server` chỉ phục vụ file tĩnh và không ghi được backup. Không mở trực tiếp `dist/index.html` bằng `file://`.

Sau khi cập nhật phiên bản, nhấn **Ctrl+F5**. Giữ nguyên địa chỉ truy cập đang dùng: `localhost`, `127.0.0.1` và các cổng khác nhau có bộ nhớ trình duyệt riêng.

## Nhập ảnh và annotate

1. Chọn folder **GT** và **OtherImages**, hoặc chọn nhiều ảnh bằng **Chọn ảnh GT lẻ / Chọn ảnh OtherImages lẻ**. Folder được đọc cả thư mục con. Theo dõi tiến độ và lỗi ngay dưới các ô chọn ảnh.
2. Chọn GT, nhập annotator, Question / Answer bằng tiếng Anh và chọn question / answer type. Spatial cần 1–2 mô tả reference objects. Reference bbox là tùy chọn trong guideline và không được yêu cầu trong bản này.
3. Cuộn để zoom, chọn **Di chuyển** để pan và **Vẽ target** để vẽ bbox. Bbox phải ôm toàn bộ phần nhìn thấy của target, nằm trong ảnh, có diện tích lớn hơn 0 và **nhỏ hơn 0.1% diện tích ảnh gốc**. Không thu nhỏ bbox giả để qua ngưỡng.
4. Chuyển sang OtherImages. Mỗi GT có pool tối đa 100 ảnh; nguồn ít hơn thì dùng toàn bộ ảnh hợp lệ. Shuffle ưu tiên ảnh chưa xuất hiện trong pool trước và giữ các ảnh đã chọn.
5. Mở, zoom và kiểm tra từng ảnh rồi xác nhận ảnh không trả lời được cùng Question. Chọn đúng **19 ảnh**; không có chọn hàng loạt.
6. Hoàn thành 5 checklist và bấm **Lưu hoàn tất**. Mỗi GT có một sample. Sửa Q/A, type, references hoặc bbox sẽ hủy xác nhận kiểm tra và chuyển sample về nháp.
7. Dùng **Export sample này** hoặc **Export hoàn tất** để xuất kết quả JSON. File chứa annotation, ID và đường dẫn đối chiếu ảnh gốc, không kèm ảnh.

Ảnh được nhận diện bằng MIME hoặc đuôi file, gồm JPG/JPEG/JFIF, PNG, WebP và các định dạng trình duyệt giải mã được. Ảnh lỗi không được nhập. Ảnh giống hệt byte được gộp bằng SHA-256; GT bị loại khỏi pool của chính nó. Ảnh crop, resize hoặc re-encode vẫn cần annotator tự phát hiện và loại.

Ứng dụng không tự upscale ảnh; bbox tính trên kích thước ảnh decode gốc. Không dùng OCR, đếm, Yes/No, chất liệu hoặc suy diễn làm câu hỏi. Tính đúng của Q&A và K=1 do annotator xác minh; phần mềm kiểm tra số lượng, IDs, bbox, review, checklist và một số mẫu câu bị cấm. Xem [guideline đầy đủ](dist/guideline.txt).

## Trạng thái ảnh GT

Danh sách GT hiển thị nhãn cho từng ảnh:

| Trạng thái | Ý nghĩa |
| --- | --- |
| Chưa annotate | Chưa nhập nội dung annotation; chỉ mở ảnh vẫn giữ trạng thái này. |
| Đang annotate | Đã nhập Q/A, reference, ghi chú, vẽ bbox hoặc chọn OtherImages; chưa lưu hoàn tất. |
| Đã annotate | Đã vượt qua kiểm tra và bấm **Lưu hoàn tất**. |

Sửa Q/A, type, references hoặc bbox của sample hoàn tất sẽ đưa ảnh về **Đang annotate**. Trạng thái được lưu cùng annotation và khôi phục sau khi tải lại trang.

## Tự động backup vào ./backup

Ảnh gốc và annotation được lưu trong **IndexedDB của trình duyệt**. Server Python tự lưu thêm bản backup annotation sau khoảng **600 ms** kể từ thay đổi gần nhất. Không cần chọn thư mục hay bấm nút tải backup.

```text
hrvs_multi_images_annotation/
├── server.py
├── dist/
└── backup/
    └── <workspace_id>.json
```

Thư mục `backup` được tạo cạnh `server.py` khi lưu lần đầu, bất kể thư mục hiện tại khi chạy lệnh. Mỗi workspace có một file riêng, được cập nhật sau thay đổi. Server ghi file tạm rồi thay thế file đích nguyên tử. Khi lỗi, giao diện báo **Backup chưa lưu** và tự thử lại. Trạng thái **Đã backup vào ./backup lúc …** xác nhận server đã lưu thành công.

Backup gồm annotation hoàn tất, bản nháp, pool và manifest ảnh; **không chứa ảnh gốc**. Ảnh không được gửi lên server. Thư mục backup nằm trên máy chạy server, không phải máy khách nếu truy cập từ máy khác. `backup/` được loại khỏi Git bằng `.gitignore`.

Mỗi trình duyệt/origin có workspace riêng; ứng dụng không đồng bộ chỉnh sửa giữa các annotator. Dung lượng ảnh phụ thuộc quota trình duyệt. Giữ ảnh gốc và backup trước khi xóa dữ liệu trang web hoặc chuyển máy.

## Khôi phục backup

- **Từ server:** chọn bản trong danh sách **Backup trên máy chủ**, rồi bấm **Khôi phục backup đã chọn**.
- **Từ file cũ:** chọn file trong **Khôi phục backup JSON**.

Nếu thiếu ảnh, nhập lại cùng folder GT và OtherImages trước khi khôi phục. Ảnh được đối chiếu bằng SHA-256. Khi backup có annotation trùng GT, ứng dụng yêu cầu xác nhận ghi đè. Sample không còn đạt kiểm tra được đưa về nháp. Sau khôi phục, thay đổi tiếp tục được tự backup.

## Xử lý lỗi

### Backup chưa lưu: Máy chủ trả lỗi 501

Trang đang chạy bằng server không hỗ trợ ghi backup, thường là `python -m http.server`. Trong terminal chạy server cũ, nhấn **Ctrl+C**, rồi chạy:

```bash
python server.py --port 8791 --bind 127.0.0.1
```

Giữ nguyên địa chỉ và cổng đã dùng. Trang sẽ tự thử lại backup; có thể nhấn Ctrl+F5 để tải lại giao diện. Không cần nhập lại ảnh nếu dữ liệu trình duyệt vẫn còn.

### Chọn ảnh nhưng không nhập được

Chạy trang qua `server.py`, không dùng `file://`. Kiểm tra trạng thái nhập để biết file lỗi hoặc định dạng không giải mã được. Nếu bộ nhớ trình duyệt bị chặn, cho phép lưu dữ liệu trang web rồi tải lại trang. Nếu quota đã đầy, giữ backup và ảnh gốc trước khi giải phóng dung lượng.

Module trình duyệt dùng đuôi `.js` để tránh một số cấu hình Python trên Windows trả `.mjs` thành `text/plain` khiến Chrome chặn JavaScript. Khi truy cập bằng HTTP qua IP mạng LAN, ứng dụng dùng SHA-256 dự phòng nếu Web Crypto không khả dụng.

## Kiểm thử

Kiểm thử logic cần Node.js 18 trở lên; kiểm thử server chỉ dùng thư viện chuẩn Python:

```bash
node --test test.mjs
node --check dist/app.js
python test_server.py
```

Kiểm thử trình duyệt cần Playwright và Chromium:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python server.py --port 8793
```

Giữ server chạy và mở terminal khác tại thư mục repo. Ví dụ với PowerShell:

```powershell
$env:HRVS_URL = 'http://127.0.0.1:8793'
node test-import.cjs
node test-backup.cjs
node test-browser.cjs
```

Có thể đặt `PLAYWRIGHT_MODULE` và `CHROMIUM_PATH` để dùng bản cài bên ngoài. Bộ kiểm thử bao gồm nhập ảnh qua HTTP không bảo mật, chọn lại ảnh, ảnh trùng/hỏng, trạng thái GT, backup và thử lại khi lỗi, khôi phục, bbox, shuffle, giới hạn 19 ảnh, checklist, export, reload và giao diện mobile. Kiểm thử trình duyệt tạo dữ liệu giả và ghi backup vào server đang chạy; nên dùng server thử nghiệm riêng.
