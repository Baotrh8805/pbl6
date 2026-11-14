// Self-check từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §7): chọn chế độ tìm (Nhật / romaji / Việt-Anh), tiêu đề
// mục, nghĩa chính không gắn nhãn "máy dịch" (D23), trường báo lỗi theo loại mục, giá trị hiện tại cho hộp báo lỗi, thẻ học dựng
// từ mục từ, nhãn từ loại, thông báo từ điển, khoá cấu hình mới. scripts/selfCheck.ts gọi: runDictionaryChecks(assert).
import { pickParams, restoreOnEnter } from "../../src/lib/searchMemory.ts";
import { DICTIONARY_PARAMS } from "../../src/features/dictionary/dictionaryMemory.ts";
import {
  cardMeaningOf,
  currentValueOf,
  deinflectNote,
  detectTranslateDirection,
  highlightParts,
  entryToWordNode,
  jlptChipClass,
  pitchKindLabel,
  headOf,
  looksLikeSentence,
  needsSubKey,
  pitchSteps,
  posLabel,
  prepareQuery,
  primaryMeaning,
  reportFieldsFor,
  tokenMeaning,
  translateDirectionLabel,
  translateStateNote,
  viStateNote,
} from "../../src/features/dictionary/dictUtils.ts";
import { describeNotification } from "../../src/services/notificationService.ts";
import { DICTIONARY_FIELDS, parseSettingNumber } from "../../src/features/admin/settingsUtils.ts";
import { queueCounts } from "../../src/features/admin/moderationUtils.ts";
import type { DictEntry } from "../../src/types/dictionary.types.ts";

export function runDictionaryChecks(assert: (cond: boolean, msg: string) => void): void {
  // ---------- chế độ tìm ----------
  const ja = prepareQuery(" 食べる ", true);
  assert(ja.mode === "ja" && ja.q === "食べる" && !ja.converted, "Từ điển: chữ Nhật → ja, cắt khoảng trắng");
  const romaji = prepareQuery("taberu", true);
  assert(romaji.mode === "ja" && romaji.q === "たべる" && romaji.converted, "Từ điển: romaji bật → たべる");
  assert(prepareQuery("taberu", false).mode === "auto", "Từ điển: tắt romaji → tìm Việt + Anh");
  assert(prepareQuery("ăn cơm", true).mode === "auto", "Từ điển: có dấu tiếng Việt → không đổi sang kana");
  assert(prepareQuery("eat", true).mode === "auto" || prepareQuery("eat", true).mode === "ja", "Từ điển: chữ Anh vẫn tra được");
  assert(prepareQuery("x".repeat(80), false).q.length === 64, "Từ điển: truy vấn cắt 64 ký tự");
  assert(prepareQuery("   ", true).q === "", "Từ điển: truy vấn rỗng");

  // ---------- tiêu đề + nghĩa ----------
  assert(headOf({ key: "k:食" }).main === "食" && headOf({ key: "k:食" }).reading === null, "Từ điển: mục chữ Hán hiện đúng chữ");
  const h = headOf({ key: "w:1", headKanji: "食べる", headKana: "たべる", reading: "たべる" });
  assert(h.main === "食べる" && h.reading === "たべる", "Từ điển: từ có kanji hiện kèm cách đọc");
  assert(headOf({ key: "w:2", headKanji: null, headKana: "する", reading: "する" }).reading === null, "Từ điển: từ kana không lặp cách đọc");
  assert(primaryMeaning({ meaningVi: "ăn", glossShort: "to eat" })?.lang === "vi", "Từ điển: có nghĩa Việt thì hiện Việt");
  assert(primaryMeaning({ meaningVi: null, glossShort: "to eat" })?.text === "to eat", "Từ điển: chưa có nghĩa Việt → nghĩa Anh");
  assert(viStateNote("OK") === null && viStateNote("EN_ONLY") === null, "Từ điển: không gắn nhãn khi chỉ là nghĩa Anh (D23)");
  assert((viStateNote("LIMIT", 0, 30) ?? "").includes("0/30"), "Từ điển: hết lượt dịch nói rõ số lượt");
  assert(!(viStateNote("AI_DOWN") ?? "").toLowerCase().includes("máy dịch"), "Từ điển: không nói 'máy dịch'");

  // ---------- báo lỗi ----------
  assert(reportFieldsFor("k:食").join() === "han_viet,kanji_meaning,meaning_vi,other", "Từ điển: chữ Hán chỉ báo Hán-Việt / nghĩa chữ / nghĩa Việt");
  assert(reportFieldsFor("w:1").includes("example_vi") && !reportFieldsFor("w:1").includes("kanji_meaning"), "Từ điển: từ vựng báo được câu ví dụ");
  assert(needsSubKey("han_viet") === "char" && needsSubKey("example") === "example" && needsSubKey("reading") === null, "Từ điển: trường cần chọn chữ / câu");
  const entry: DictEntry = {
    key: "w:1358280",
    kind: "word",
    headKanji: "食べる",
    headKana: "たべる",
    reading: "たべる",
    hanViet: "THỰC",
    hanVietChars: [{ char: "食", reading: "THỰC" }],
    jlpt: "N5",
    glossShort: "to eat",
    meaningVi: "ăn; dùng bữa",
    examples: [
      { id: "1", jpn: "ご飯を食べる。", eng: "I eat rice.", vi: "Tôi ăn cơm." },
      { id: "2", jpn: "パンを食べる。", eng: "I eat bread.", vi: null },
      { id: "3", jpn: "魚を食べる。", eng: "I eat fish.", vi: "Tôi ăn cá." },
      { id: "4", jpn: "肉を食べる。", eng: "I eat meat.", vi: "Tôi ăn thịt." },
    ],
  };
  assert(currentValueOf(entry, "han_viet", "食") === "THỰC", "Từ điển: giá trị hiện tại của Hán-Việt theo chữ");
  assert(currentValueOf(entry, "example_vi", "2") === "", "Từ điển: câu chưa dịch → trống");
  assert(currentValueOf(entry, "meaning_en") === "to eat", "Từ điển: nghĩa Anh hiện tại");

  // ---------- thẻ học từ mục ----------
  const meaning = cardMeaningOf(entry);
  assert(meaning.startsWith("ăn; dùng bữa\nVD: ご飯を食べる。 — Tôi ăn cơm."), "Từ điển: nghĩa thẻ = nghĩa + ví dụ đã dịch");
  assert(meaning.split("\n").length === 3, "Từ điển: tối đa 2 dòng ví dụ trên thẻ");
  const node = entryToWordNode(entry);
  assert(node.label === "食べる" && node.reading === "たべる" && node.hanViet === "THỰC" && node.level === "N5", "Từ điển: dựng thẻ đúng trường");

  // ---------- trọng âm, nhãn ----------
  const steps = pitchSteps(["た", "べ", "る"], ["L", "H", "L"]);
  assert(steps[1].high && steps[1].drop && !steps[0].high, "Từ điển: bậc trọng âm hạ sau mora cao");
  assert(posLabel("v1") === "Động từ nhóm 2" && posLabel("xyz", "fallback") === "fallback", "Từ điển: nhãn từ loại Việt + dự phòng");

  // ---------- thông báo ----------
  const applied = describeNotification({
    id: 1, type: "DICT_REPORT_RESOLVED", readAt: null, createdAt: "",
    payload: { entryKey: "w:1358280", kind: "ENTRY", action: "APPLIED", status: "RESOLVED" },
  });
  assert(applied.text.includes("đã được áp dụng") && applied.to === "/dictionary?e=w%3A1358280", "Từ điển: thông báo áp dụng dẫn về mục");
  const dismissed = describeNotification({
    id: 2, type: "DICT_REPORT_RESOLVED", readAt: null, createdAt: "",
    payload: { entryKey: "k:食", status: "DISMISSED", note: "đúng rồi" },
  });
  assert(dismissed.text.includes("không được chấp nhận") && dismissed.text.includes("đúng rồi"), "Từ điển: thông báo từ chối kèm lý do");
  const hidden = describeNotification({ id: 3, type: "DICT_COMMENT_HIDDEN", readAt: null, createdAt: "", payload: { entryKey: "w:1", note: "spam" } });
  assert(hidden.text.includes("bị ẩn") && hidden.text.includes("spam"), "Từ điển: thông báo ẩn bình luận");
  const mnemonic = describeNotification({ id: 4, type: "MNEMONIC_REVIEWED", readAt: null, createdAt: "", payload: { kanji: "食", status: "APPROVED" } });
  assert(mnemonic.to === "/dictionary?tab=kanji&k=%E9%A3%9F", "Từ điển: link mẹo nhớ về tab Hán tự");

  // ---------- cấu hình + badge admin ----------
  const limit = DICTIONARY_FIELDS.find((f) => f.key === "dictionary_ai_hourly_limit")!;
  assert(parseSettingNumber(limit, "0") === 0 && parseSettingNumber(limit, "1001") === null, "Từ điển: trần dịch 0..1000");
  assert(queueCounts({ openDictReports: 3 }).openDictReports === 3 && queueCounts({}).openDictReports === null, "Từ điển: badge báo cáo từ điển");

  // ---------- tra dạng đã chia (食べました → 食べる) ----------
  assert(
    deinflectNote({ deinflected: { query: "食べました", lemmas: ["食べる"] } }) ===
      "«食べました» là dạng đã chia hoặc là một cụm, đang hiện trước mục của dạng gốc: 食べる.",
    "Từ điển: ghi chú dạng gốc"
  );
  assert(deinflectNote({ deinflected: { query: "日本語を", lemmas: ["日本語", " ", "日本語", 3] } })?.endsWith(": 日本語.") === true, "Từ điển: dạng gốc bỏ rỗng / trùng / sai kiểu");
  assert(deinflectNote({ deinflected: null }) === null && deinflectNote(undefined) === null, "Từ điển: không có dạng gốc -> không ghi chú");
  assert(deinflectNote({ deinflected: { query: "x", lemmas: [] } }) === null, "Từ điển: danh sách dạng gốc rỗng -> không ghi chú");

  // ---------- tab Câu: tô cụm tìm ----------
  const hp = (t: string, q: string) => highlightParts(t, q).map((p) => (p.hit ? `[${p.text}]` : p.text)).join("");
  assert(hp("ご飯を食べた。食べた？", "食べた") === "ご飯を[食べた]。[食べた]？", "Từ điển (Câu): tô mọi chỗ khớp");
  assert(hp("I Eat rice", "eat") === "I [Eat] rice", "Từ điển (Câu): không phân biệt hoa thường, giữ chữ gốc");
  assert(hp("The great fish eat the small, eating", "eat") === "The great fish [eat] the small, [eat]ing", "Từ điển (Câu): chữ Latin chỉ tô ở đầu từ như server");
  assert(hp("食べた。食べたい", "食べ") === "[食べ]た。[食べ]たい", "Từ điển (Câu): chữ Nhật tô mọi chỗ");
  assert(hp("Tôi ăn cơm", "an com") === "Tôi ăn cơm", "Từ điển (Câu): gõ không dấu thì không tô (không đoán)");
  assert(hp("abc", "  ") === "abc" && highlightParts("", "a").length === 0, "Từ điển (Câu): q rỗng / text rỗng");

  // ---------- giao diện 31/10: chip JLPT, nhãn trọng âm ----------
  assert(jlptChipClass("N5").includes("emerald") && jlptChipClass("n1").includes("purple"), "Từ điển: chip JLPT theo cấp, không phân biệt hoa thường");
  assert(jlptChipClass(null) === jlptChipClass("N9") && jlptChipClass(null).includes("primary"), "Từ điển: cấp lạ / thiếu -> màu primary");
  assert(pitchKindLabel("heiban") === "Bằng (heiban)" && pitchKindLabel("odaka") === "Cao đuôi (odaka)", "Từ điển: nhãn trọng âm tiếng Việt");
  assert(pitchKindLabel("lạ") === "lạ", "Từ điển: kiểu trọng âm lạ giữ nguyên");

  // ---------- tab Dịch (spec 2026-10-28, D33) ----------
  assert(detectTranslateDirection("ご飯を食べました。") === "ja-vi" && detectTranslateDirection("Tôi ăn cơm") === "vi-ja", "Dịch: tự nhận hướng");
  assert(detectTranslateDirection("Từ 食べる nghĩa là gì?") === "ja-vi", "Dịch: văn bản trộn coi là tiếng Nhật (như backend)");
  assert(translateDirectionLabel("vi-ja") === "Việt → Nhật" && translateDirectionLabel("ja-vi") === "Nhật → Việt", "Dịch: nhãn hướng");
  assert(translateStateNote("OK") === null && translateStateNote("OK", 1, 20, "ai") === null, "Dịch: bản AI không có ghi chú");
  const limitNote = translateStateNote("LIMIT", 0, 20) ?? "";
  assert(limitNote.includes("0/20") && limitNote.includes("phân tích"), "Dịch: hết lượt nói rõ số lượt và vẫn có phân tích");
  assert((translateStateNote("OFF") ?? "").includes("tắt") && (translateStateNote("AI_DOWN") ?? "").includes("lại"), "Dịch: OFF / AI_DOWN có hướng xử lý");
  assert(!(translateStateNote("OFF") ?? "").toLowerCase().includes("ghép"), "Dịch: không hứa ghép từ thành câu");
  assert(translateStateNote("OK", 0, 0, "local") === null, "Dịch local thành công không báo thiếu quota");
  assert((translateStateNote("TOO_LONG", 0, 0, "local") ?? "").includes("ngắn"), "Câu dài cần hướng dẫn rút ngắn");
  assert((translateStateNote("UNAVAILABLE", 0, 0, "local") ?? "").includes("thử lại"), "Model chưa sẵn sàng có hướng thử lại");
  // D34: bản dịch máy offline nói rõ nguồn + lý do; BUSY / UNAVAILABLE nhẹ nhàng, có hướng làm tiếp, không chữ "lỗi"
  const offNote = translateStateNote("OFF", 20, 20, "offline") ?? "";
  assert(offNote.includes("offline") && offNote.includes("tắt"), "Dịch: bản offline nói rõ nguồn và lý do");
  assert((translateStateNote("LIMIT", 0, 20, "offline") ?? "").includes("0/20"), "Dịch: bản offline do hết lượt nêu số lượt");
  for (const st of ["BUSY", "UNAVAILABLE", "AI_DOWN", "OFF", "LIMIT"] as const) {
    const n = translateStateNote(st, 0, 20) ?? "";
    assert(n.length > 0 && !n.toLowerCase().includes("lỗi"), `Dịch: ${st} có ghi chú, không báo lỗi`);
  }
  assert((translateStateNote("BUSY") ?? "").includes("Dịch lại"), "Dịch: BUSY hướng dẫn dịch lại");
  assert(looksLikeSentence("ご飯を食べました。") && looksLikeSentence("昨日は友達と映画を見ました"), "Dịch: nhận cả câu Nhật (dấu câu hoặc dài)");
  assert(!looksLikeSentence("食べる") && !looksLikeSentence("Tôi ăn cơm hôm nay.") && !looksLikeSentence("  "), "Dịch: không gợi ý cho từ đơn / câu Việt / rỗng");
  const tok = { meaning: null, dictVi: "ăn", glossEn: "to eat", posVi: "động từ", particle: false };
  assert(tokenMeaning(tok)?.source === "dict" && tokenMeaning({ ...tok, meaning: "đã ăn" })?.source === "ai", "Dịch: nghĩa AI theo ngữ cảnh đứng trước nghĩa từ điển");
  assert(tokenMeaning({ ...tok, dictVi: null })?.lang === "en", "Dịch: dự phòng gloss Anh");
  assert(tokenMeaning({ meaning: null, dictVi: null, glossEn: null, posVi: "trợ từ", particle: true })?.text === "trợ từ", "Dịch: trợ từ không nghĩa hiện từ loại");
  assert(tokenMeaning({ meaning: null, dictVi: null, glossEn: null, posVi: "dấu", particle: false }) === null, "Dịch: không có gì -> null");
  const tl = DICTIONARY_FIELDS.find((f) => f.key === "dictionary_translate_hourly_limit")!;
  assert(parseSettingNumber(tl, "20") === 20 && parseSettingNumber(tl, "0") === 0 && parseSettingNumber(tl, "1001") === null, "Dịch: trần lượt dịch câu 0..1000");

  // ---- nhớ trạng thái khi rời trang (sidebar dẫn về /dictionary không kèm tham số) -------------------------------------------
  const P = DICTIONARY_PARAMS;
  assert(pickParams(new URLSearchParams("tab=kanji&k=食&x=1&utm=a"), P) === "tab=kanji&k=%E9%A3%9F", "Nhớ: chỉ tham số của từ điển");
  assert(pickParams(new URLSearchParams(""), P) === "", "Nhớ: trang trống ghi chuỗi rỗng (người dùng xoá ô tìm)");
  assert(restoreOnEnter(new URLSearchParams(""), "q=%E5%AD%A6%E7%94%9F", P)?.get("q") === "学生", "Khôi phục: vào trang trống thì lấy lại câu tìm");
  assert(restoreOnEnter(new URLSearchParams("tab=notebook"), "q=a", P) === null, "Khôi phục: URL đã có trạng thái (link Tra chữ này, tab) thì không đè");
  assert(restoreOnEnter(new URLSearchParams(""), "", P) === null && restoreOnEnter(new URLSearchParams(""), null, P) === null, "Khôi phục: đã nhớ trạng thái trống / chưa nhớ gì");
  assert(restoreOnEnter(new URLSearchParams(""), "utm=x", P) === null, "Khôi phục: bỏ tham số lạ");
}
