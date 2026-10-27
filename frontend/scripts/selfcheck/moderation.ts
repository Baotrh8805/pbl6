// Self-check kiểm duyệt AI + HLR (spec 2026-10-27 đêm §7, §11): tô từ bị đánh dấu, nhãn, câu sau lượt chấm, độ nhớ, đọc response.
// scripts/selfCheck.ts gọi: runModerationChecks(assert).
import {
  aiLabelText,
  deckRecallText,
  highlightSpans,
  moderationTone,
  parseModerationStatus,
  parseReviewOutcome,
  recallPct,
  recallTone,
  reviewOutcomeText,
} from "../../src/lib/moderation.ts";

export function runModerationChecks(assert: (cond: boolean, msg: string) => void): void {
  // tô từ theo vị trí
  const seg = highlightSpans("Mày viết cái gì vậy, vl thật", [
    { word: "Mày", start: 0, end: 3, score: 0.99 },
    { word: "vl", start: 21, end: 23, score: 0.98 },
  ]);
  assert(seg.map((s) => s.text).join("") === "Mày viết cái gì vậy, vl thật", "Ghép lại các đoạn = nguyên văn");
  assert(seg.filter((s) => s.flagged).map((s) => s.text).join("|") === "Mày|vl", "Đúng hai từ được tô");
  // theo từ khi không có vị trí (không phân biệt hoa thường, từ ghép `_`)
  const loose = highlightSpans("Đồ ngu, khuất mắt đi", [
    { word: "ngu", start: -1, end: -1, score: 0.9 },
    { word: "khuất_mắt", start: -1, end: -1, score: 0.9 },
  ]);
  assert(loose.filter((s) => s.flagged).map((s) => s.text).join("|") === "ngu|khuất mắt", "Từ ghép pyvi so theo cụm");
  assert(highlightSpans("ngung ngu", [{ word: "ngu", start: -1, end: -1, score: 1 }]).filter((s) => s.flagged).length === 1, "Không tô giữa từ (ngung)");
  assert(highlightSpans("abc", [{ word: "zzz", start: 10, end: 13, score: 1 }]).length === 1, "Vị trí ngoài chuỗi bị bỏ");
  assert(highlightSpans("", []).length === 0, "Chuỗi rỗng");
  // chồng lấn: giữ span đầu
  const ov = highlightSpans("thằng chó", [
    { word: "thằng chó", start: 0, end: 9, score: 1 },
    { word: "chó", start: 6, end: 9, score: 1 },
  ]);
  assert(ov.length === 1 && ov[0].flagged, "Span chồng lấn chỉ tô một lần");

  assert(aiLabelText(2) === "Thù ghét" && aiLabelText(0) === "Sạch" && aiLabelText(null) === "Chưa chấm", "Nhãn 0/1/2");
  assert(moderationTone("BLOCKED") === "error" && moderationTone("FLAGGED") === "warning" && moderationTone("CLEAN") === "neutral", "Tông badge");
  assert(parseModerationStatus("blocked") === "BLOCKED" && parseModerationStatus("xyz") === "OPEN" && parseModerationStatus(null) === "OPEN", "Trạng thái từ URL");

  assert(recallPct(0.784) === "78 %" && recallPct(null) === "—", "Phần trăm độ nhớ");
  assert(recallTone(0.5) === "error" && recallTone(0.8) === "warning" && recallTone(0.95) === "success", "Tông độ nhớ");
  const outcome = parseReviewOutcome({ cardId: "c", reps: 2, intervalDays: 1, ease: 2.5, dueAt: "2026-10-28T00:00:00Z", recallBefore: 0.55, hlrBrake: true, scheduler: "sm2+hlr" });
  assert(outcome !== null && outcome.hlrBrake && outcome.scheduler === "sm2+hlr", "Đọc response chấm thẻ");
  const line = reviewOutcomeText(outcome);
  assert(line !== null && line.includes("1 ngày") && line.includes("55 %") && line.includes("giữ nguyên"), "Câu sau lượt chấm có phanh");
  assert(reviewOutcomeText(parseReviewOutcome({ intervalDays: 3, dueAt: "x" })) === "Ôn lại sau 3 ngày", "Không có HLR: chỉ khoảng ôn");
  assert(parseReviewOutcome(null) === null && parseReviewOutcome({ intervalDays: "3" }) === null, "Response hỏng → null");
  assert(deckRecallText({ studied: 0, avgRecall: null, forgettingSoon: 0 }) === null, "Bộ chưa học: không chip");
  assert(deckRecallText({ studied: 5, avgRecall: 0.78, forgettingSoon: 2 }) === "Độ nhớ ≈ 78 % · 2 thẻ sắp quên", "Chip có thẻ sắp quên");
  assert(deckRecallText({ studied: 5, avgRecall: 0.9, forgettingSoon: 0 }) === "Độ nhớ ≈ 90 %", "Chip không có thẻ sắp quên");
}
