// Hàm thuần xử lý kana cho luyện phát âm (E3): so khớp văn bản nhận dạng với cách đọc chuẩn,
// tách mora cho luyện trọng âm (E4). Không đụng DOM -> chạy được trong scripts/selfCheck.ts.

/** Katakana (ァ–ヶ) -> hiragana; ký tự khác (kể cả ー) giữ nguyên. */
export const kataToHira = (s: string): string =>
    s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

// Hàng nguyên âm của từng kana để thay ー (trường âm) bằng nguyên âm trước đó:
// コーヒー -> こおひい, so khớp được với kết quả nhận dạng viết kiểu nào cũng ra một dạng.
const VOWEL_ROWS: Array<[string, string]> = [
    ["あかさたなはまやらわがざだばぱぁゃゎ", "あ"],
    ["いきしちにひみりぎじぢびぴぃ", "い"],
    ["うくすつぬふむゆるぐずづぶぷぅゅっ", "う"],
    ["えけせてねへめれげぜでべぺぇ", "え"],
    ["おこそとのほもよろをごぞどぼぽぉょ", "お"],
];

const vowelOf = (ch: string): string | null => {
    for (const [row, vowel] of VOWEL_ROWS) if (row.includes(ch)) return vowel;
    return null;
};

/**
 * Chuẩn hoá để so khớp: NFKC (full-width -> ASCII, half-width katakana -> full-width),
 * katakana -> hiragana, trường âm về một dạng (ー -> nguyên âm trước đó; おう -> おお, えい -> ええ),
 * bỏ khoảng trắng / dấu câu (。、・「」!? ...). Giữ chữ cái (kana, kanji, latin thường) và chữ số.
 */
export const normalizeKana = (s: string): string => {
    const hira = kataToHira(s.normalize("NFKC")).toLowerCase();
    let out = "";
    let prev = ""; // ký tự cuối đã ghi vào out
    const push = (c: string) => {
        out += c;
        prev = c;
    };
    for (const ch of hira) {
        const prevVowel = prev ? vowelOf(prev) : null;
        if (ch === "ー" || ch === "〜" || ch === "~") {
            if (prevVowel) push(prevVowel);
            continue;
        }
        // Trường âm viết theo chính tả (おう, えい) và viết bằng ー (おー, えー) đọc y hệt nhau; nhận dạng
        // trả về kiểu nào cũng phải ra cùng một dạng, nếu không せんせい / せんせー bị trừ điểm oan.
        if (ch === "う" && prevVowel === "お") {
            push("お");
            continue;
        }
        if (ch === "い" && prevVowel === "え") {
            push("え");
            continue;
        }
        if (/[\p{L}\p{N}]/u.test(ch)) push(ch);
    }
    return out;
};

/** Khoảng cách Levenshtein tính theo code point (kanji / emoji là một ký tự). */
export const levenshtein = (a: string, b: string): number => {
    const x = [...a];
    const y = [...b];
    if (x.length === 0) return y.length;
    if (y.length === 0) return x.length;
    let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i++) {
        const cur = [i];
        for (let j = 1; j <= y.length; j++) {
            const cost = x[i - 1] === y[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[y.length];
};

/** Độ giống 0–1 (1 = trùng khớp; hai chuỗi rỗng coi như trùng). */
export const levenshteinRatio = (a: string, b: string): number => {
    const len = Math.max([...a].length, [...b].length);
    if (len === 0) return 1;
    return 1 - levenshtein(a, b) / len;
};

// Kana nhỏ gắn vào mora trước (きょ = 1 mora); ん, っ, ー là mora riêng.
const SMALL_KANA = "ゃゅょぁぃぅぇぉゎ";

/** Tách cách đọc thành mora: "がっこう" -> [が, っ, こ, う]; "きょう" -> [きょ, う]. */
export const moraSplit = (reading: string): string[] => {
    const hira = kataToHira(reading.normalize("NFKC"));
    const moras: string[] = [];
    for (const ch of hira) {
        if (!/[\p{L}\p{N}]/u.test(ch)) continue; // bỏ khoảng trắng, dấu câu
        if (SMALL_KANA.includes(ch) && moras.length > 0) moras[moras.length - 1] += ch;
        else moras.push(ch);
    }
    return moras;
};

export interface PronunciationScore {
    /** Phương án nhận dạng khớp nhất (nguyên văn, để hiện cho người học). */
    best: string;
    /** 0–100. */
    pct: number;
}

/**
 * Điểm phát âm = độ giống cao nhất giữa cách đọc chuẩn và các phương án nhận dạng (sau chuẩn hoá).
 * Không có phương án nào -> 0.
 */
export const pronunciationScore = (target: string, transcripts: string[]): PronunciationScore => {
    const want = normalizeKana(target);
    let best = "";
    let ratio = -1;
    for (const t of transcripts) {
        const r = levenshteinRatio(want, normalizeKana(t));
        if (r > ratio) {
            ratio = r;
            best = t;
        }
    }
    return { best, pct: ratio < 0 ? 0 : Math.round(ratio * 100) };
};
