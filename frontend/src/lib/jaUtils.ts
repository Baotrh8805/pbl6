import type { ReadingSegment } from "@/types/api.types";

export type FuriganaStyle = "ruby" | "stacked";

// Nhận diện nhãn loại từ hoặc ghi chú đặt trong ngoặc ở đuôi từ (ví dụ: (V), [N], (v1), (adj), (N3), （動）)
export const isPosTag = (str: string): boolean => {
    return /^[[（(【][^\]）)】]+[\]）)】]$/.test(str.trim());
};

const isKana = (ch: string): boolean => {
    const code = ch.charCodeAt(0);
    return (code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF);
};

export function splitTermPos(term: string): { cleanTerm: string; tag: string } {
    const m = term.match(/\s*([[（(【][^\]）)】]+[\]）)】])\s*$/);
    if (m && m.index != null) {
        return {
            cleanTerm: term.slice(0, m.index).trim(),
            tag: m[1].trim(),
        };
    }
    return { cleanTerm: term.trim(), tag: "" };
}

/**
 * Tự động phân đoạn và căn chỉnh Furigana chuẩn xác cho từng chữ Kanji
 * (So khớp Okurigana tiền tố, hậu tố và điểm tựa giữa Kanji và Kana).
 */
export function autoAlignFurigana(term: string, reading?: string | null): ReadingSegment[] {
    if (!term) return [];
    if (!reading || !reading.trim()) return [{ kanji: term, kana: term }];

    const { cleanTerm, tag } = splitTermPos(term);
    const trimReading = reading.trim();

    // 1. Nếu từ không chứa Kanji (toàn Hiragana/Katakana): không gắn Furigana thừa
    let hasKanji = false;
    for (const ch of cleanTerm) {
        if (!isKana(ch) && !/\s/.test(ch)) {
            hasKanji = true;
            break;
        }
    }
    if (!hasKanji) {
        const res: ReadingSegment[] = [{ kanji: cleanTerm, kana: cleanTerm }];
        if (tag) res.push({ kanji: tag, kana: tag });
        return res;
    }

    // 2. Nếu từ thuần Kanji (không có Okurigana xen kẽ): gắn toàn bộ reading
    let hasKanaInTerm = false;
    for (const ch of cleanTerm) {
        if (isKana(ch)) {
            hasKanaInTerm = true;
            break;
        }
    }
    if (!hasKanaInTerm) {
        const res: ReadingSegment[] = [{ kanji: cleanTerm, kana: trimReading }];
        if (tag) res.push({ kanji: tag, kana: tag });
        return res;
    }

    // 3. Tách các ký tự Kana trùng khớp ở đầu (Prefix Kana)
    let startTerm = 0;
    let startReading = 0;
    const prefixSegments: ReadingSegment[] = [];

    while (
        startTerm < cleanTerm.length &&
        startReading < trimReading.length &&
        cleanTerm[startTerm] === trimReading[startReading] &&
        isKana(cleanTerm[startTerm])
    ) {
        prefixSegments.push({ kanji: cleanTerm[startTerm], kana: cleanTerm[startTerm] });
        startTerm++;
        startReading++;
    }

    // 4. Tách các ký tự Kana trùng khớp ở đuôi (Suffix Okurigana)
    let endTerm = cleanTerm.length - 1;
    let endReading = trimReading.length - 1;
    const tailSegments: ReadingSegment[] = [];

    while (
        endTerm >= startTerm &&
        endReading >= startReading &&
        cleanTerm[endTerm] === trimReading[endReading] &&
        isKana(cleanTerm[endTerm])
    ) {
        tailSegments.unshift({ kanji: cleanTerm[endTerm], kana: cleanTerm[endTerm] });
        endTerm--;
        endReading--;
    }

    const subTerm = cleanTerm.slice(startTerm, endTerm + 1);
    const subReading = trimReading.slice(startReading, endReading + 1);

    // 5. Phân tích phần ở giữa dựa trên các ký tự Kana làm điểm tựa (Pivot)
    function alignMiddle(t: string, r: string): ReadingSegment[] {
        if (!t) return [];
        if (!r) return [{ kanji: t, kana: t }];

        let pivotIdx = -1;
        for (let i = 0; i < t.length; i++) {
            if (isKana(t[i])) {
                pivotIdx = i;
                break;
            }
        }

        if (pivotIdx === -1) {
            return [{ kanji: t, kana: r }];
        }

        let pivotEnd = pivotIdx;
        while (pivotEnd < t.length && isKana(t[pivotEnd])) {
            pivotEnd++;
        }
        const pivotKana = t.slice(pivotIdx, pivotEnd);

        const rIdx = r.indexOf(pivotKana, 1);
        if (rIdx === -1) {
            return [{ kanji: t, kana: r }];
        }

        const leftKanji = t.slice(0, pivotIdx);
        const leftKana = r.slice(0, rIdx);

        const rightT = t.slice(pivotEnd);
        const rightR = r.slice(rIdx + pivotKana.length);

        return [
            { kanji: leftKanji, kana: leftKana },
            { kanji: pivotKana, kana: pivotKana },
            ...alignMiddle(rightT, rightR),
        ];
    }

    const middleSegments = alignMiddle(subTerm, subReading);
    const allSegments = [...prefixSegments, ...middleSegments, ...tailSegments];
    if (tag) {
        allSegments.push({ kanji: tag, kana: tag });
    }
    return allSegments;
}
