// Self-check từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §7): chọn chế độ tìm (Nhật / romaji / Việt-Anh), tiêu đề
// mục, nghĩa chính không gắn nhãn "máy dịch" (D23), trường báo lỗi theo loại mục, giá trị hiện tại cho hộp báo lỗi, thẻ học dựng
// từ mục từ, nhãn từ loại, thông báo từ điển, khoá cấu hình mới. scripts/selfCheck.ts gọi: runDictionaryChecks(assert).
import {
  cardMeaningOf,
  currentValueOf,
  entryToWordNode,
  headOf,
  needsSubKey,
  pitchSteps,
  posLabel,
  prepareQuery,
  primaryMeaning,
  reportFieldsFor,
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
}
