# Kiến Trúc Chi Tiết Hệ Thống PBL6

## 1. Mô Hình Tổng Thể

```
+-----------------------------------------------------------+
|               Client (Người học tiếng Nhật)                |
|       Web Browser / Mobile Web (React + TypeScript)       |
|    - Chụp ảnh tài liệu (Camera/Upload)                   |
|    - Lật thẻ Flashcard, làm bài kiểm tra Quiz             |
|    - Vẽ nét Kanji trên Canvas                             |
|    - Ghi âm phát âm giọng đọc                             |
+-----------------------------+-----------------------------+
                              |
                     HTTPS / REST API (JWT)
                              |
                              v
+-----------------------------------------------------------+
|          Core Backend Gateway (Java Spring Boot 3)        |
|    - Quản lý tài khoản & phân quyền người dùng             |
|    - Quản lý CRUD Bộ thẻ (Decks), Thẻ (Cards), Quiz       |
|    - Tích hợp thanh toán gói học Premium (PayOS/VNPay)    |
|    - Điều phối luồng xử lý sang AI Service                |
+---------------+-----------------------------+-------------+
                |                             |
     Spring Data JPA (JDBC)                   | HTTP / REST
                |                             v
+---------------v-------------+  +--------------------------+
|  Supabase (Cloud) / Local   |  |   AI & NLP Engine        |
|  - PostgreSQL (Quan hệ)     |  |   (Python FastAPI)       |
|  - Object Storage (Ảnh, Âm) |  |   - OCR chữ dọc          |
|  - Redis (Cache từ điển)    |  |   - NLP (Furigana, Hán-Việt)
+-----------------------------+  |   - DTW chấm nét Kanji   |
                                 |   - Praat chấm Pitch     |
                                 |   - GraphRAG (Neo4j)     |
                                 +--------------+-----------+
                                                |
                                          Cypher Query
                                                v
                                 +--------------------------+
                                 | Neo4j (Graph Database)   |
                                 | - Đồ thị tri thức        |
                                 | - Phát hiện mâu thuẫn    |
                                 +--------------------------+
```

## 2. Chuỗi Xử Lý 3 Mẫu Hình AI (Theo Đề Tài)

Theo đặc tả của đề tài, chuỗi mô hình AI được kết hợp theo 3 mẫu hình:
1. **Dự phòng theo ngưỡng tin cậy (Fallback by Confidence):** 
   - Khi OCR chữ dọc bằng model cục bộ, nếu confidence score < 85%, tự động fallback sang mô hình Vision LLM (Gemini 1.5 Flash).
2. **Sinh-rồi-lọc bằng mô hình thứ hai (Generate-then-Filter):**
   - Model 1 (LLM) sinh các câu hỏi Quiz và các câu nhiễu (distractors) có căn cứ ngôn ngữ học.
   - Model 2 (Rule-based / Classifier) kiểm tra xem câu hỏi có chứa lỗi ngữ pháp hoặc sai lệch âm Hán-Việt hay không trước khi lưu vào database.
3. **Hợp nhất song song hai nhánh độc lập (Parallel Fusion):**
   - Nhánh 1: RAG dựa trên Vector Search trong Supabase (`pgvector`).
   - Nhánh 2: Graph Search trên đồ thị tri thức Neo4j.
   - Hợp nhất kết quả để đưa ra giải thích lộ trình và phát hiện mâu thuẫn tài liệu.
