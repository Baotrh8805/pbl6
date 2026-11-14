// Hàm thuần dùng chung, không import gì -> kiểm được bằng scripts/selfCheck.ts.

/** "Lê Văn Chính" -> "LC"; "chinh" -> "CH"; rỗng -> "?". Dùng làm avatar chữ (không lưu ảnh đại diện). */
export const getInitials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    // Array.from tách theo code point, không cắt đôi ký tự ngoài BMP.
    const first = (w: string) => Array.from(w)[0] ?? "";
    if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase("vi");
    return (first(words[0]) + first(words[words.length - 1])).toLocaleUpperCase("vi");
};

// Chữ Hán (kanji) để bật nút "Viết" / tách từng chữ cho bảng luyện viết (E2).
// \p{Script=Han} phủ CJK thống nhất + mở rộng + tương thích; loại dấu lặp 々〆 và 〇 vì không phải
// chữ để luyện nét.
const NOT_KANJI = new Set(["々", "〆", "〇", "〻"]);

/** true khi `ch` là đúng MỘT chữ Hán (code point). */
export const isCjkIdeograph = (ch: string): boolean => {
    const cps = Array.from(ch);
    return cps.length === 1 && /^\p{Script=Han}$/u.test(cps[0]) && !NOT_KANJI.has(cps[0]);
};

/** Chuỗi có ít nhất một chữ Hán (để biết thẻ nào luyện viết được). */
export const hasCjkIdeograph = (s: string): boolean => Array.from(s).some(isCjkIdeograph);

/** Các chữ Hán trong chuỗi, bỏ trùng, giữ thứ tự xuất hiện: "日本日" -> ["日", "本"]. */
export const extractKanji = (s: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ch of Array.from(s)) {
        if (isCjkIdeograph(ch) && !seen.has(ch)) {
            seen.add(ch);
            out.push(ch);
        }
    }
    return out;
};
