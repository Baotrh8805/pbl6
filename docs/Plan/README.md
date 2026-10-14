# Spec & kế hoạch (`docs/Plan/`)

Mỗi tính năng lớn có một **spec** (`specs/`: vấn đề, phương án, quyết định) và đôi khi một **kế hoạch triển khai** (`plans/`: từng bước).
Cột trạng thái cho biết file đó **có phản ánh code hiện tại hay không**: đọc nó trước khi tin vào nội dung.

| Ngày | Tài liệu | Trạng thái (14/10/2026) |
| :--- | :--- | :--- |
| 12/10 | [specs/2026-10-12-trich-xuat-cum-tu-design.md](specs/2026-10-12-trich-xuat-cum-tu-design.md) | **Đã làm.** Bảng / danh sách từ vựng → trích theo cụm, dùng nghĩa in sẵn. Mô tả hành vi hiện hành ở [../EXTRACTION.md](../EXTRACTION.md) |
| 12/10 | [specs/2026-10-12-dich-nghia-offline-design.md](specs/2026-10-12-dich-nghia-offline-design.md), [plans/2026-10-12-dich-nghia-offline.md](plans/2026-10-12-dich-nghia-offline.md) | **Đã thử rồi hoàn tác, không có trong code.** Dịch EN → VI bằng NLLB / CTranslate2. Giữ lại kết quả spike (Argos kém, NLLB 22/27 đúng, giấy phép CC-BY-NC) |
| 13/10 | [specs/2026-10-13-thanh-tien-trinh-boc-tach-design.md](specs/2026-10-13-thanh-tien-trinh-boc-tach-design.md) | **Chờ duyệt, chưa có code.** Thanh tiến trình bóc tách xuyên trang trong `AppLayout` |
| 13/10 | [specs/2026-10-13-giao-dien-trang-boc-tach-ai-design.md](specs/2026-10-13-giao-dien-trang-boc-tach-ai-design.md) | **Chờ duyệt, chưa có code.** Nâng cấp danh sách `/extractions` (phase, lọc, chất lượng OCR). Phụ thuộc spec thanh tiến trình |
| 13/10 | [specs/2026-10-13-ket-qua-boc-tach-kieu-sua-bo-the-design.md](specs/2026-10-13-ket-qua-boc-tach-kieu-sua-bo-the-design.md) | **Chờ duyệt, chưa có code.** Trang kết quả sửa như "Sửa bộ thẻ"; có đề xuất **lưu file gốc trên server** (đảo quyết định "không lưu file" 07/10) và API thêm / xoá item, cần nhóm chốt trước |
| 14/10 | [specs/2026-10-14-lo-trinh-hoc-tap-design.md](specs/2026-10-14-lo-trinh-hoc-tap-design.md), [plans/2026-10-14-lo-trinh-hoc-tap.md](plans/2026-10-14-lo-trinh-hoc-tap.md) | **Đã làm.** Lộ trình học tập: tài liệu + số ngày → tách chương (ai-service) → bản nháp → thư mục + bộ thẻ/chương + lịch theo ngày; thay hẳn trang `/roadmap`. Xem [../LEARNING_PATH.md](../LEARNING_PATH.md) |

Quy ước: spec mới ghi rõ ngày, nhánh và trạng thái ở dòng đầu; khi triển khai xong thì sửa dòng đó và thêm mục vào [../CHANGELOG.md](../CHANGELOG.md).
