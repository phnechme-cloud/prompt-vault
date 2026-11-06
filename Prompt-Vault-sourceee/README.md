# Prompt Vault — hướng dẫn cài đặt

Website này chỉ đọc prompt từ Google Sheet. Việc làm sạch chỉ tác động đến phần xem và sao chép; nội dung prompt trong Sheet không bị sửa. Hãy làm theo thứ tự dưới đây.

## Phần 1 — chuẩn bị Google Sheet và Apps Script

1. Mở Google Sheet `Kho_Prompt_Da_Phan_Loai`. Tab dữ liệu cần tên `Kho`. Hàng đầu tiên bắt buộc có tiêu đề `ID` và ít nhất một cột prompt như `Nội dung Prompt 1`, `Prompt 2`, `Prompt 3`… Cột `Nội dung` đứng riêng cũng được tính là Bản 1. Nếu có cột tên viết tay, đặt tiêu đề `Tên Prompt` (hoặc `Tên`); nếu có cột phân loại, dùng `PL chức năng` (hoặc `Phân loại` / `Đề mục`). Các thao tác đổi tên hoặc phân loại cần cột tương ứng. Không cần thêm cột nhập liệu mới.
2. Trong Sheet, chọn **Tiện ích mở rộng → Apps Script**.
3. Mở tệp `Code.gs` trong bộ mã Prompt Vault, sao chép toàn bộ nội dung, dán vào trình soạn thảo Apps Script thay cho đoạn mẫu. Nhấn **Lưu**.
4. Trên thanh chọn hàm, chọn `setup`, nhấn **Chạy**. Ở lần đầu, Google sẽ hỏi quyền truy cập Sheet; chọn tài khoản sở hữu file và cho phép. Hàm này tạo hai tab `Meta` và `Trạng thái`, lưu mã truy cập trong Script Properties, rồi ghi mã vào **Nhật ký thực thi**. Mở **Nhật ký thực thi**, sao chép giá trị `ACCESS_TOKEN` và giữ riêng.
5. Chọn **Triển khai → Bản triển khai mới → Ứng dụng web**. Đặt:
   - **Thực thi với tư cách:** Tôi (`Me`).
   - **Ai có quyền truy cập:** Bất kỳ ai (`Anyone`).
6. Nhấn **Triển khai**, hoàn tất bước cấp quyền nếu Google yêu cầu, rồi sao chép URL ứng dụng web có đuôi `/exec`.

Nếu cập nhật `Code.gs` sau này, mở **Triển khai → Quản lý bản triển khai**, chọn biểu tượng chỉnh sửa, tạo phiên bản mới rồi cập nhật.

## Phần 2 — nối giao diện với Apps Script

1. Mở `dist/config.js` trong thư mục website tĩnh.
2. Thay `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE` bằng URL `/exec` vừa sao chép. Giữ nguyên dấu ngoặc kép. **Không dán mã truy cập vào URL hoặc tệp này.**
3. Tải thư mục web lên một host tĩnh hỗ trợ HTTPS, ví dụ GitHub Pages, Netlify hoặc Cloudflare Pages. Thư mục xuất bản là `dist/`; nội dung trong đó đã là HTML/CSS/JavaScript tĩnh, không cần cài thêm phần mềm hay chạy lệnh build.
4. Mở địa chỉ website bằng Safari hoặc Chrome. Chọn biểu tượng cài đặt, dán `ACCESS_TOKEN` vào ô **Mã truy cập**, nhấn **Lưu** rồi **Kiểm tra kết nối**. Mã chỉ lưu trên thiết bị đó; khi dùng thiết bị khác, nhập mã lại một lần.
5. Trên iPhone, mở website bằng Safari rồi chọn **Chia sẻ → Thêm vào Màn hình chính** để cài như ứng dụng. Trên Android, mở menu Chrome rồi chọn **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**.

## Phần 3 — khóa quyền chia sẻ Sheet

Sau khi ứng dụng web chạy được, quay lại Google Sheet và đổi quyền chia sẻ file thành **Hạn chế**. Apps Script vẫn đọc và ghi được vì ứng dụng đã triển khai chạy bằng quyền của chủ file. Không chia sẻ trực tiếp Sheet cho người dùng website.

## Cách sử dụng

- Dán prompt vào các cột prompt hiện có trong tab `Kho`; mỗi ô là một bản. Không cần tạo thêm cột nhập liệu.
- Tên viết tay và phân loại viết tay được ưu tiên. Website chỉ ghi vào cột `Tên Prompt` và `PL chức năng` khi bạn chủ động đổi hoặc xác nhận đề mục.
- Khi ngoại tuyến, website vẫn tìm và sao chép những prompt đã được tải về thiết bị. Các thao tác ghim, yêu thích, đổi tên, đổi đề mục và lượt dùng được giữ trong hàng đợi rồi gửi lại khi có mạng.
- Dùng **Sạch/Gốc** trong phần chi tiết để đổi văn bản được xem và sao chép. Chế độ mặc định được lưu riêng trên từng thiết bị.
- Nếu thiếu tiêu đề cột hoặc sai tên tab, website hiện thông báo nêu rõ phần cần sửa; không tạo prompt rỗng.

## Mã truy cập và giới hạn bảo mật

Mã truy cập chỉ là **khóa nhẹ, không phải bảo mật thật sự**. Người có mã có thể gọi Apps Script; mã được nhập và lưu trong trình duyệt của thiết bị. Cơ chế khóa sau 10 lần nhập sai trong 10 phút chỉ làm chậm việc dò mã, không thay thế một hệ thống đăng nhập. Hãy dùng mã đủ dài, không đăng công khai mã và chỉ cấp quyền triển khai Apps Script cho đúng phạm vi dự án. Không đưa dữ liệu nhạy cảm vào Sheet nếu mô hình chia sẻ này không phù hợp.

## Bộ kiểm tra hàm thuần

Yêu cầu Node.js 18 trở lên. Trong thư mục dự án, chạy:

```sh
npm test
```

Bộ kiểm tra bao gồm các ví dụ làm sạch, biến số, tên tự động, gợi ý đề mục và tìm kiếm không dấu ở Phụ lục A.

## Sửa lỗi thường gặp

- **`unauthorized`:** kiểm tra lại `ACCESS_TOKEN`; mã được lấy từ nhật ký sau khi chạy `setup()`.
- **URL chưa được cấu hình:** sửa `dist/config.js`, tải lại website và xóa cache nếu trình duyệt còn giữ phiên bản cũ.
- **Thiếu cột bắt buộc:** sửa tiêu đề ở hàng đầu tab `Kho`; không đổi vị trí cột là được, nhưng tên phải khớp một trong các lựa chọn được hỗ trợ.
- **Website báo không kết nối:** kiểm tra URL `/exec`, trạng thái triển khai Apps Script và quyền truy cập `Anyone`.
- **Không thấy prompt vừa dán:** đảm bảo ô prompt có nội dung và đợi tối đa 60 giây để cache phiên bản hết hạn, hoặc bấm làm mới.
