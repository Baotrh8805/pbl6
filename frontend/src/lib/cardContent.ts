/**
 * Nội dung thẻ nhiều dòng: dòng không rỗng đầu tiên = định nghĩa chính (Quiz cũng dùng làm đáp án),
 * các dòng sau = định nghĩa phụ, ví dụ, ghi chú. Hiển thị tách 2 phần để dòng chính nổi bật.
 */
export function splitContent(content: string): { head: string; rest: string } {
  const lines = content.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first < 0) return { head: "", rest: "" };
  return { head: lines[first].trim(), rest: lines.slice(first + 1).join("\n").trim() };
}
