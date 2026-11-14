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
 * Kiểm tra xem chuỗi có phải chỉ gồm ký tự Kana tiếng Nhật (Hiragana, Katakana, trường âm, dấu phân tách) hay không.
 * Nếu chứa chữ Latin (a-z), chữ tiếng Việt có dấu, chữ Hán -> false.
 */
export function isPureKana(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  // Hiragana: \u3040-\u309F, Katakana: \u30A0-\u30FF, \u31F0-\u31FF, Chōonpu: \u30FC, Nakaguro: \u30FB, dấu lặp: ゝゞ
  return /^[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u30FC\u30FB\u309D\u309E\u30FD\u30FE\s]+$/u.test(trimmed);
}

/**
 * Tách cách đọc ở đầu nội dung nếu có dạng:
 * "<Kana> - <Phần còn lại>" (ví dụ: "おか - KHÂU - Đồi, gò đất.")
 * Trả về [reading, restContent]. Nếu không có dạng trên, trả về [null, content].
 */
export function extractLeadingKanaReading(content: string): [string | null, string] {
  if (!content) return [null, ""];
  const trimmed = content.trim();
  const newlineIdx = trimmed.indexOf("\n");
  const firstLine = newlineIdx >= 0 ? trimmed.slice(0, newlineIdx) : trimmed;
  const rest = newlineIdx >= 0 ? trimmed.slice(newlineIdx) : "";

  // Dòng đầu có dạng "<Kana> - <Nội dung>" (hỗ trợ dấu gạch ngang -, en-dash –, em-dash —)
  const match = firstLine.match(/^([\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u30FC\u30FB\u309D\u309E\u30FD\u30FE\s]+?)\s*[-–—]\s*(.*)$/u);
  if (match && isPureKana(match[1])) {
    const reading = match[1].trim();
    const cleanFirstLine = match[2].trim();
    const finalContent = cleanFirstLine + rest;
    return [reading || null, finalContent];
  }

  return [null, trimmed];
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
      if (tokens.length === 1) {
        result.push({ term: tokens[0], reading: null, meaning: "" });
      } else if (tokens.length === 2) {
        // Trường hợp 2 cột: Thuật ngữ | Nội dung
        // Tự động nhận diện nếu đầu nội dung có cách đọc Kana: "おか - KHÂU - Đồi, gò đất."
        const [extractedReading, cleanMeaning] = extractLeadingKanaReading(tokens[1]);
        result.push({ term: tokens[0], reading: extractedReading, meaning: cleanMeaning });
      } else {
        result.push({ term: tokens[0], reading: tokens[1], meaning: tokens.slice(2).join("\n") });
      }
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

    let meaning = tokens.slice(1).join("\n").trim();

    // FALLBACK 1: Nếu meaning rỗng nhưng readingValue lại có nội dung
    // Xảy ra khi từ không có dấu phân cách nghĩa (ví dụ từ không có Kanji, chỉ có "Thuật ngữ|Định nghĩa")
    // Nếu readingValue không phải là Kana thuần túy (chứa chữ Latin/Việt) -> đây chính là định nghĩa!
    if (!meaning && readingValue) {
      if (!isPureKana(readingValue)) {
        meaning = readingValue;
        readingValue = null;
      }
    }

    // FALLBACK 2: Nếu chưa có readingValue nhưng đầu meaning có dạng "<Kana> - <Nghĩa>"
    if (!readingValue && meaning) {
      const [extractedReading, cleanMeaning] = extractLeadingKanaReading(meaning);
      if (extractedReading) {
        readingValue = extractedReading;
        meaning = cleanMeaning;
      }
    }

    // FALLBACK 3: Nếu readingValue bị nuốt cả cụm dạng "おか - KHÂU - Đồi..."
    if (readingValue && readingValue.includes("-")) {
      const [extractedReading, cleanRest] = extractLeadingKanaReading(readingValue);
      if (extractedReading) {
        readingValue = extractedReading;
        meaning = cleanRest + (meaning ? "\n" + meaning : "");
      }
    }

    result.push({ term, reading: readingValue, meaning });
  }
  return result;
}
