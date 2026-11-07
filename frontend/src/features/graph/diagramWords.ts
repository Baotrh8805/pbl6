// Chuyển từ ghép của sơ đồ chữ Hán sang node từ của bản đồ Hán-Việt để tái dùng hộp "Thêm vào bộ thẻ" (AddWordToDeckModal,
// wordToCardDto): nghĩa Việt trước, rồi nghĩa Anh; thiếu cả hai thì modal tự rơi về âm Hán-Việt / cách đọc. Tách khỏi file
// component để Fast Refresh không phàn nàn.
import type { HanVietWordNode } from "../../types/api.types.ts";

export const toHanVietWord = (w: {
    term?: string;
    label?: string;
    reading?: string | null;
    meaningVi?: string | null;
    meaningEn?: string | null;
    jlpt?: string | null;
    hanViet?: string | null;
}): HanVietWordNode => {
    const label = w.term ?? w.label ?? "";
    return {
        id: `w:${label}`,
        type: "word",
        label,
        reading: w.reading ?? "",
        meaning: w.meaningVi ?? w.meaningEn ?? "",
        level: w.jlpt ?? null,
        hanViet: w.hanViet ?? "",
    };
};
