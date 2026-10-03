-- Gộp "Ví dụ" vào "Định nghĩa": thẻ chỉ còn một trường nội dung nhiều dòng (cột meaning).
-- Dòng đầu = định nghĩa chính (Quiz dùng làm đáp án); các dòng sau = định nghĩa phụ, ví dụ, ghi chú.
ALTER TABLE flashcards ALTER COLUMN meaning TYPE text;

UPDATE flashcards
   SET meaning = meaning || E'\n\n' || example
 WHERE example IS NOT NULL AND btrim(example) <> '';

ALTER TABLE flashcards DROP COLUMN example;
