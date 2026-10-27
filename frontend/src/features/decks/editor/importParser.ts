import type { CardDto } from "../../../types/api.types.ts";

/**
 * Ô "Tùy chỉnh" là input một dòng: người dùng gõ \n / \t dạng chữ để chỉ xuống dòng / tab.
 * Vd. "\n\n" = các thẻ cách nhau bằng một dòng trống.
 */
export function unescapeDelimiter(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/**
 * Cách tách cách đọc khỏi phần còn lại (rà soát 27/10, phần thứ ba của hộp Nhập dữ liệu):
 * - same: cùng dấu với "thuật ngữ – định nghĩa" (cách cũ: 2 cột = từ + nghĩa, 3+ cột = từ, cách đọc, nghĩa...)
 * - delim: dấu riêng, vd. "開発|かいはつ\tphát triển" với termDelim = \t, readingDelim = "|"
 *   (cách đọc đứng ngay sau thuật ngữ, trước dấu thuật ngữ – định nghĩa)
 * - paren: cách đọc trong ngoặc ngay sau thuật ngữ: 食べる（たべる） / 食べる(たべる) / 食べる【たべる】
 * - none: không có cột cách đọc (cột 2 trở đi đều là nội dung)
 */
export type ReadingRule = { kind: "same" } | { kind: "delim"; value: string } | { kind: "paren" } | { kind: "none" };

const PAREN_RE = /^(.*?)\s*[（(【[]\s*([^（)）【】[\]]+?)\s*[）)】\]]\s*$/u;

/** Tách "食べる（たべる）" -> [食べる, たべる]; không có ngoặc -> [nguyên văn, null]. */
export function splitParenReading(cell: string): [string, string | null] {
  const m = PAREN_RE.exec(cell.trim());
  if (!m || !m[1].trim()) return [cell.trim(), null];
  return [m[1].trim(), m[2].trim() || null];
}

/**
 * Văn bản dán vào (Excel, Anki, Quizlet...) -> danh sách thẻ.
 * Mỗi thẻ: [thuật ngữ, nghĩa] | [thuật ngữ, cách đọc, nghĩa] | [thuật ngữ, cách đọc, nghĩa, ví dụ...] (từ cột 3 gộp thành nội dung nhiều dòng).
 * Dòng chỉ có 1 cột vẫn được giữ (nghĩa rỗng) để người dùng bổ sung trong trình soạn.
 */
export function parseImportText(
  rawText: string,
  termDefDelim: string,
  cardDelim: string,
  reading: ReadingRule = { kind: "same" }
): CardDto[] {
  if (!rawText.trim() || !termDefDelim || !cardDelim) return [];
  if (reading.kind === "delim" && (!reading.value || reading.value === termDefDelim)) reading = { kind: "same" };
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

    if (reading.kind === "same") {
      if (tokens.length === 1) result.push({ term: tokens[0], reading: null, meaning: "" });
      else if (tokens.length === 2) result.push({ term: tokens[0], reading: null, meaning: tokens[1] });
      else result.push({ term: tokens[0], reading: tokens[1], meaning: tokens.slice(2).join("\n") });
      continue;
    }

    let term = tokens[0];
    let readingValue: string | null = null;
    if (reading.kind === "paren") {
      [term, readingValue] = splitParenReading(term);
    } else if (reading.kind === "delim") {
      const i = term.indexOf(reading.value);
      if (i > 0) {
        readingValue = term.slice(i + reading.value.length).trim() || null;
        term = term.slice(0, i).trim();
      }
    }
    // Cột từ thứ 2 trở đi (định nghĩa, ví dụ...) gộp vào nội dung, mỗi cột một dòng
    result.push({ term, reading: readingValue, meaning: tokens.slice(1).join("\n") });
  }
  return result;
}
