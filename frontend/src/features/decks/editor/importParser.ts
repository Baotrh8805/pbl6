import type { CardDto } from "../../../types/api.types.ts";

/**
 * Ô "Tùy chỉnh" là input một dòng: người dùng gõ \n / \t dạng chữ để chỉ xuống dòng / tab.
 * Vd. mặc định "\n\n" = các thẻ cách nhau bằng một dòng trống.
 */
export function unescapeDelimiter(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/**
 * Văn bản dán vào (Excel, Anki, Quizlet...) -> danh sách thẻ.
 * Mỗi thẻ: [thuật ngữ, nghĩa] | [thuật ngữ, cách đọc, nghĩa] | [thuật ngữ, cách đọc, nghĩa, ví dụ...] (từ cột 3 gộp thành nội dung nhiều dòng).
 * Dòng chỉ có 1 cột vẫn được giữ (nghĩa rỗng) để người dùng bổ sung trong trình soạn.
 */
export function parseImportText(rawText: string, termDefDelim: string, cardDelim: string): CardDto[] {
  if (!rawText.trim() || !termDefDelim || !cardDelim) return [];
  // Chuẩn hoá xuống dòng Windows/Mac để "\n" trong dấu phân cách khớp mọi nguồn dán
  const text = rawText.replace(/\r\n?/g, "\n");

  const result: CardDto[] = [];
  for (const row of text.split(cardDelim)) {
    const tokens = row
      .trim()
      .split(termDefDelim)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    if (tokens.length === 1) {
      result.push({ term: tokens[0], reading: null, meaning: "" });
    } else if (tokens.length === 2) {
      result.push({ term: tokens[0], reading: null, meaning: tokens[1] });
    } else {
      result.push({
        term: tokens[0],
        reading: tokens[1],
        // Cột từ thứ 3 trở đi (định nghĩa, ví dụ...) gộp vào nội dung, mỗi cột một dòng
        meaning: tokens.slice(2).join("\n"),
      });
    }
  }
  return result;
}
