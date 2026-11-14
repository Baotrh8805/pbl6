// Bộ gõ romaji -> kana (E6) viết tay, không dùng thư viện. Hàm THUẦN, không đụng DOM -> chạy được
// trong scripts/selfCheck.ts. Dùng kiểu "tăng dần" như IME: chuyển phần đầu đã đủ âm tiết, giữ đuôi
// chưa đủ (vd. "k", "ky", "n") ở dạng romaji để chờ phím tiếp theo.
//
// Quy ước (ghi rõ vì romaji vốn nhập nhằng):
// - Nhận cả Hepburn lẫn Kunrei: shi/si, chi/ti, tsu/tu, fu/hu, ji/zi, sha/sya, cha/tya, ja/zya/jya;
//   di/du/dya là ぢ/づ/ぢゃ (như IME, không phải じ).
// - Không phân biệt hoa thường ("KA" = "ka"); katakana / hiragana do tham số `mode` quyết định,
//   không dùng chữ hoa để đổi bảng chữ như wanakana.
// - Phụ âm đôi (kk, tt, ss, pp, ... kể cả "tch") -> っ rồi phụ âm thứ hai bắt đầu âm tiết mới:
//   "gakkou" -> がっこう, "matcha" -> まっちゃ. "nn" KHÔNG phải っん (xem bên dưới).
// - Chữ "n" là chỗ nhập nhằng nhất:
//     n + nguyên âm / ny + nguyên âm -> な行 / にゃ行      ("nihongo" -> にほんご)
//     n + phụ âm khác n, y            -> ん, phụ âm giữ lại ("shinbun" -> しんぶん)
//     n'                              -> ん, nuốt dấu nháy   ("kon'nichiha" -> こんにちは)
//     nn + nguyên âm                  -> ん + な行          ("konnichiha" -> こんにちは, "konna" -> こんな)
//     nn + y / phụ âm                 -> ん, chữ sau giữ lại ("kannji" -> かんじ, "kinnyoubi" -> きんようび)
//     nn + hết chuỗi                  -> chờ (pending "nn"): chưa biết người dùng sẽ gõ nguyên âm
//                                        (こんに...) hay dừng (こん); romajiToKanaFull / flush -> ん.
//     n + hết chuỗi                   -> chờ (pending "n"); flush -> ん.
//   Khác IME của Windows (ở đó "konnichiha" -> こんいちは và phải gõ 3 chữ n): chọn cách đọc "nn +
//   nguyên âm = ん + な行" vì người học Việt hay gõ đúng một chữ n cho ん và một cho な行.
// - "-" (gạch ngang) -> "ー" ở cả hai bảng: hiragana cũng cần ー trong từ mượn / cách đọc kéo dài.
// - Chữ cái không thể mở đầu âm tiết (vd. "l" đứng một mình) được giữ NGUYÊN trong `text` để người
//   dùng thấy mà sửa, không bị nuốt âm thầm: "hello" -> へっぉ (ll -> っ, lo -> ぉ như IME),
//   "x1" -> "x1". Ký tự ngoài a-z, "'" và "-" (kana, số, khoảng trắng, dấu câu) đi qua nguyên vẹn,
//   nên gọi lại toKana trên chuỗi đã chuyển không làm đổi kết quả (idempotent).

export type KanaMode = "hiragana" | "katakana";

export interface KanaResult {
    /** Phần đã chuyển (kana + ký tự đi qua nguyên vẹn). */
    text: string;
    /** Đuôi romaji chưa đủ âm tiết, chờ phím tiếp theo ("" nếu không có). */
    pending: string;
}

// Bảng hiragana; katakana suy ra bằng kanaToKatakana. Khoá dài nhất 4 ký tự (xtsu / ltsu).
const TABLE: Record<string, string> = {
    a: "あ", i: "い", u: "う", e: "え", o: "お",
    ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
    kya: "きゃ", kyu: "きゅ", kye: "きぇ", kyo: "きょ",
    ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
    gya: "ぎゃ", gyu: "ぎゅ", gye: "ぎぇ", gyo: "ぎょ",
    sa: "さ", si: "し", su: "す", se: "せ", so: "そ",
    sha: "しゃ", shi: "し", shu: "しゅ", she: "しぇ", sho: "しょ",
    sya: "しゃ", syu: "しゅ", sye: "しぇ", syo: "しょ",
    za: "ざ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
    ja: "じゃ", ji: "じ", ju: "じゅ", je: "じぇ", jo: "じょ",
    jya: "じゃ", jyu: "じゅ", jye: "じぇ", jyo: "じょ",
    zya: "じゃ", zyu: "じゅ", zye: "じぇ", zyo: "じょ",
    ta: "た", ti: "ち", tu: "つ", te: "て", to: "と",
    cha: "ちゃ", chi: "ち", chu: "ちゅ", che: "ちぇ", cho: "ちょ",
    tya: "ちゃ", tyu: "ちゅ", tye: "ちぇ", tyo: "ちょ",
    tsu: "つ", tsa: "つぁ", tsi: "つぃ", tse: "つぇ", tso: "つぉ",
    thi: "てぃ", thu: "てゅ",
    da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
    dya: "ぢゃ", dyu: "ぢゅ", dyo: "ぢょ",
    dhi: "でぃ", dhu: "でゅ",
    na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
    nya: "にゃ", nyu: "にゅ", nye: "にぇ", nyo: "にょ",
    ha: "は", hi: "ひ", hu: "ふ", he: "へ", ho: "ほ",
    hya: "ひゃ", hyu: "ひゅ", hye: "ひぇ", hyo: "ひょ",
    fu: "ふ", fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ", fyu: "ふゅ",
    ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
    bya: "びゃ", byu: "びゅ", bye: "びぇ", byo: "びょ",
    pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
    pya: "ぴゃ", pyu: "ぴゅ", pye: "ぴぇ", pyo: "ぴょ",
    ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
    mya: "みゃ", myu: "みゅ", mye: "みぇ", myo: "みょ",
    ya: "や", yu: "ゆ", ye: "いぇ", yo: "よ",
    ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
    rya: "りゃ", ryu: "りゅ", rye: "りぇ", ryo: "りょ",
    wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
    wha: "うぁ", whi: "うぃ", whe: "うぇ", who: "うぉ",
    va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ", vyu: "ゔゅ",
    ca: "か", ci: "し", cu: "く", ce: "せ", co: "こ",
    qa: "くぁ", qi: "くぃ", qu: "く", qe: "くぇ", qo: "くぉ",
    // Kana nhỏ: x- hoặc l- (như IME)
    xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ",
    la: "ぁ", li: "ぃ", lu: "ぅ", le: "ぇ", lo: "ぉ",
    xya: "ゃ", xyu: "ゅ", xyo: "ょ", lya: "ゃ", lyu: "ゅ", lyo: "ょ",
    xtu: "っ", xtsu: "っ", ltu: "っ", ltsu: "っ",
    xwa: "ゎ", lwa: "ゎ", xka: "ゕ", lka: "ゕ", xke: "ゖ", lke: "ゖ",
};

const MAX_KEY = 4;

// Mọi tiền tố THỰC SỰ của khoá ("k", "ky", "xts", ...): đuôi chuỗi nằm trong đây thì còn hy vọng
// thành âm tiết -> giữ làm pending thay vì phát ra nguyên vẹn.
const PREFIXES = new Set<string>();
for (const key of Object.keys(TABLE)) {
    for (let len = 1; len < key.length; len++) PREFIXES.add(key.slice(0, len));
}

const VOWELS = new Set(["a", "i", "u", "e", "o"]);
// Phụ âm gõ đôi thành っ. Không có n (nn -> ん) và x (tiền tố kana nhỏ, không ai gõ đôi).
const SOKUON = new Set(["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "p", "q", "r", "s", "t", "v", "w", "y", "z"]);
const isLetter = (ch: string | undefined): ch is string => ch !== undefined && ch >= "a" && ch <= "z";
const isApostrophe = (ch: string | undefined): boolean => ch === "'" || ch === "’";
// Chỉ hạ chữ hoa ASCII: String.toLowerCase() theo Unicode có thể đổi ĐỘ DÀI chuỗi ("İ" -> "i̇" là 2 ký tự)
// làm lower[i] lệch khỏi input[i] và nhánh "đi qua nguyên vẹn" ghi ra chữ "undefined". Ký tự ngoài
// A-Z (kể cả chữ hoa có dấu) vốn không phải romaji nên giữ nguyên là đúng ý.
const lowerAscii = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Hiragana (ぁ–ゖ) -> katakana; ký tự khác (kể cả ー) giữ nguyên. */
export const kanaToKatakana = (s: string): string =>
    s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));

/** Chuỗi có hiragana / katakana (kể cả katakana nửa chiều rộng)? Dùng để bỏ qua chuyển đổi khi dán kana. */
export const hasKana = (s: string): boolean => /[ぁ-ゟ゠-ヿｦ-ﾟ]/.test(s);

/**
 * Chuyển phần đầu đủ âm tiết của `input` sang kana, giữ đuôi chưa đủ ở `pending`.
 * Ký tự không phải romaji đi qua nguyên vẹn nên có thể gọi trên chuỗi đã trộn kana + romaji.
 */
export const toKana = (input: string, mode: KanaMode = "hiragana"): KanaResult => {
    const lower = lowerAscii(input);
    const n = lower.length;
    const emit = (hira: string) => (mode === "katakana" ? kanaToKatakana(hira) : hira);
    let out = "";
    let i = 0;

    while (i < n) {
        const ch = lower[i];

        if (ch === "-") {
            out += "ー";
            i++;
            continue;
        }
        if (!isLetter(ch)) {
            // Kana đã chuyển, số, khoảng trắng, dấu câu, dấu nháy lẻ: giữ nguyên (ký tự gốc, không lowercase).
            out += input[i];
            i++;
            continue;
        }

        if (ch === "n") {
            const next = lower[i + 1];
            const after = lower[i + 2];
            if (isApostrophe(next)) {
                out += emit("ん");
                i += 2;
                continue;
            }
            if (next === undefined) return { text: out, pending: input.slice(i) };
            if (next === "n") {
                if (after === undefined) return { text: out, pending: input.slice(i) };
                out += emit("ん");
                // nn + nguyên âm / dấu nháy: chữ n thứ hai mở đầu đơn vị mới (に, ん); còn lại nuốt cả hai.
                i += VOWELS.has(after) || isApostrophe(after) ? 1 : 2;
                continue;
            }
            if (next === "y") {
                if (after === undefined) return { text: out, pending: input.slice(i) };
                if (!VOWELS.has(after)) {
                    out += emit("ん");
                    i += 1;
                    continue;
                }
                // ny + nguyên âm: rơi xuống tra bảng (にゃ...)
            } else if (!VOWELS.has(next)) {
                out += emit("ん");
                i += 1;
                continue;
            }
        } else if (SOKUON.has(ch)) {
            const next = lower[i + 1];
            if (next === ch || (ch === "t" && next === "c" && lower[i + 2] === "h")) {
                out += emit("っ");
                i += 1;
                continue;
            }
        }

        // Khớp khoá dài nhất
        let matched = false;
        for (let len = Math.min(MAX_KEY, n - i); len >= 1; len--) {
            const kana = TABLE[lower.slice(i, i + len)];
            if (kana !== undefined) {
                out += emit(kana);
                i += len;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Chưa đủ âm tiết nhưng đuôi chuỗi còn có thể thành âm tiết -> chờ phím tiếp
        const rest = lower.slice(i);
        if (rest.length < MAX_KEY && PREFIXES.has(rest)) return { text: out, pending: input.slice(i) };

        // Chữ cái không thể mở đầu âm tiết ở vị trí này: giữ nguyên để người dùng thấy mà sửa
        out += input[i];
        i++;
    }
    return { text: out, pending: "" };
};

/** Chốt đuôi còn chờ khi người dùng dừng gõ (Enter / rời ô): n, nn -> ん; đuôi khác giữ nguyên. */
export const flushPending = (pending: string, mode: KanaMode = "hiragana"): string => {
    if (pending === "") return "";
    const lower = lowerAscii(pending);
    if (lower === "n" || lower === "nn") return mode === "katakana" ? "ン" : "ん";
    // "ny" -> ん + "y": chữ n chắc chắn là ん, phần sau để người dùng tự xử lý
    if (lower.startsWith("n")) return (mode === "katakana" ? "ン" : "ん") + pending.slice(1);
    return pending;
};

/** Chuyển cả chuỗi một lần (không còn pending): "kekkon" -> けっこん, "konn" -> こん. */
export const romajiToKanaFull = (input: string, mode: KanaMode = "hiragana"): string => {
    const { text, pending } = toKana(input, mode);
    return text + flushPending(pending, mode);
};
