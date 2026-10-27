"""Đồ thị tri thức trên Neo4j (UC-34) + GraphRAG (UC-35) — spec docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md.

client   : kết nối Neo4j (tầng duy nhất của hệ thống nối đồ thị), lỗi → GraphUnavailable (router trả 503)
schema   : ràng buộc / chỉ mục, danh sách nhãn lớp tham chiếu và lớp người học
builder  : dựng lớp tham chiếu từ dữ liệu của ai-service (JMdict, JLPT, Unihan, KRADFILE, bộ thủ, ngữ pháp, câu ví dụ)
sync     : nhận lô dữ liệu người học từ backend (Postgres) và ghi vào đồ thị, dọn dữ liệu cũ theo mã lần đồng bộ
queries  : truy vấn Cypher cho giao diện (lân cận, đường nối, gợi ý, xung đột, trạng thái)
rag      : GraphRAG hỏi đáp (thực thể → nhánh đồ thị + nhánh văn bản → hợp nhất → Gemini / trả lời mẫu)
"""
