// Self-check quiz đa loại + ngân hàng câu hỏi (hợp đồng API đợt 2, §1). scripts/selfCheck.ts gọi runQuizChecks(assert).
// Chỉ hàm thuần + bộ parse response (không gọi mạng); import tương đối + đuôi .ts để node chạy trực tiếp.
import { parseAttemptState, parseQuestions } from "../../src/services/studyService.ts";
import {
  DEFAULT_QUESTION_TYPES,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  buildFlagRequest,
  buildQuestionPatch,
  capabilityCount,
  describeDistractorResult,
  distractorErrorMessage,
  enabledQuestionTypes,
  flagErrorMessage,
  flagReasonsFor,
  normalizeAdminQuestion,
  normalizeTypedAnswer,
  optionLetter,
  parseCapabilities,
  parseDistractorResult,
  questionDisplay,
  questionTypesForRequest,
  toQuestionDraft,
  toggleQuestionType,
  typeDisabledReason,
  validateFlag,
  validateQuestionDraft,
  validateQuestionOptions,
} from "../../src/features/quiz/quizUtils.ts";
import type { AdminQuestionRow } from "../../src/types/quiz.types.ts";

export function runQuizChecks(assert: (cond: boolean, msg: string) => void): void {
  // ---------- nhãn loại câu ----------
  assert(
    QUESTION_TYPES.map((t) => QUESTION_TYPE_LABELS[t]).join("/") ===
      "Nghĩa/Kanji giống hình/Từ đồng âm/Gõ cách đọc (IME)/Chia thể động từ",
    "Quiz: nhãn 5 loại câu đúng thứ tự màn bắt đầu"
  );
  assert(QUESTION_KINDS.every((k) => !!QUESTION_KIND_LABELS[k]), "Quiz: mọi kind admin có nhãn");
  assert(DEFAULT_QUESTION_TYPES.join() === "meaning", "Quiz: mặc định chỉ câu nghĩa (như server)");

  // ---------- capabilities -> loại bật được ----------
  const caps = parseCapabilities({ meaning: 12, kanjiLookalike: 0, homophone: "3", reading: 5, conjugation: -1 });
  assert(caps !== null && caps.homophone === 3 && caps.conjugation === 0, "Quiz: capabilities chuỗi số -> số, âm -> 0");
  assert(parseCapabilities(null) === null && parseCapabilities([1]) === null, "Quiz: capabilities hỏng -> null (server chưa hỗ trợ)");
  assert(parseCapabilities({})?.reading === 0, "Quiz: thiếu khoá -> 0, loại đó bị tắt");
  assert(enabledQuestionTypes(caps).join() === "meaning,homophone,reading", "Quiz: chỉ loại có ≥ 1 thẻ được bật");
  assert(enabledQuestionTypes(null).join() === "meaning", "Quiz: server chưa có endpoint -> chỉ câu nghĩa");
  assert(capabilityCount(caps, "kanji_lookalike") === 0 && capabilityCount(null, "meaning") === null, "Quiz: đọc số theo khoá camelCase");
  assert(typeDisabledReason("homophone", caps) === null, "Quiz: loại có thẻ -> không có lý do tắt");
  assert(/sinh câu nhiễu/.test(typeDisabledReason("kanji_lookalike", caps) ?? ""), "Quiz: kanji giống hình 0 thẻ -> gợi ý sinh câu nhiễu");
  assert(typeDisabledReason("meaning", null) === null && typeDisabledReason("reading", null) !== null, "Quiz: không có số liệu -> nghĩa vẫn chọn được, loại khác tắt");
  assert(
    toggleQuestionType(["reading"], "meaning", true).join() === "meaning,reading" &&
      toggleQuestionType(["meaning", "reading"], "meaning", false).join() === "reading" &&
      toggleQuestionType(["meaning"], "meaning", true).join() === "meaning",
    "Quiz: bật/tắt loại giữ thứ tự chuẩn, không trùng"
  );
  assert(questionTypesForRequest(["meaning", "reading"], null) === undefined, "Quiz: server cũ -> không gửi questionTypes");
  assert(
    questionTypesForRequest(["conjugation", "reading", "kanji_lookalike"], caps)?.join() === "reading",
    "Quiz: bỏ loại đã chọn nhưng nay bị tắt"
  );
  assert(questionTypesForRequest(["conjugation"], caps)?.length === 0, "Quiz: không còn loại dùng được -> rỗng (chặn Bắt đầu)");

  // ---------- chuẩn hoá câu gõ (giống server: katakana -> hiragana, bỏ khoảng trắng / dấu câu) ----------
  assert(normalizeTypedAnswer("カク") === "かく", "Quiz gõ: katakana -> hiragana");
  assert(normalizeTypedAnswer(" か く。") === "かく", "Quiz gõ: bỏ khoảng trắng và dấu câu");
  assert(normalizeTypedAnswer("たべ・ます！") === "たべます", "Quiz gõ: bỏ ・ và ！ full-width");
  assert(normalizeTypedAnswer("コーヒー") === "こーひー", "Quiz gõ: giữ ー (server không gập trường âm)");
  assert(normalizeTypedAnswer("、。 ") === "", "Quiz gõ: chỉ dấu câu -> rỗng (không gửi)");

  // ---------- parse câu hỏi (ranh giới không đáng tin) ----------
  const qs = parseQuestions([
    { cardId: "c1", term: "書く", reading: "かく", options: [], type: "reading", inputMode: "typing", questionId: "q-1", prompt: "Cách đọc của 書く" },
    { cardId: "c2", term: "読む", type: "reading" },
    { cardId: "c3", term: "火", options: ["một"] },
    { cardId: "c4", term: "待つ", options: ["待つ", "持つ", "特つ"], type: "kanji_lookalike", inputMode: "choice", prompt: "Chữ nào có nghĩa 'chờ đợi' (まつ)?" },
    { cardId: "c5", term: "水", options: ["nước", "lửa"], type: "weird_future_type", questionId: 42 },
    { cardId: "c6", term: "木", options: "không phải mảng", inputMode: "typing" },
  ]);
  assert(qs.map((x) => x.cardId).join() === "c1,c2,c4,c5", "Quiz: câu gõ options=[] được giữ; câu chọn < 2 phương án / options hỏng bị bỏ");
  assert(qs[0].inputMode === "typing" && qs[0].options.length === 0 && qs[0].questionId === "q-1", "Quiz: giữ inputMode typing + questionId");
  assert(qs[1].inputMode === "typing", "Quiz: reading thiếu inputMode, không phương án -> câu gõ");
  assert(qs[2].type === "kanji_lookalike" && qs[2].prompt !== null, "Quiz: giữ type + prompt");
  assert(qs[3].type === "meaning" && qs[3].inputMode === "choice" && qs[3].questionId === "42", "Quiz: type lạ -> meaning; questionId số -> chuỗi");
  const legacy = parseQuestions([{ cardId: "c1", term: "水", reading: "みず", options: ["nước", "lửa"] }]);
  assert(
    legacy.length === 1 && legacy[0].type === "meaning" && legacy[0].prompt === null && legacy[0].questionId === null,
    "Quiz: response kiểu cũ -> câu nghĩa, không prompt, không báo lỗi được"
  );

  const st = parseAttemptState({
    attemptId: "a-2",
    deckId: "d",
    mode: "practice",
    serverNow: "2026-10-19T00:00:00Z",
    questions: [
      {
        cardId: "c1", term: "書く", options: [], type: "conjugation", inputMode: "typing", chosen: "かいて",
        feedback: { correct: true, correctAnswer: "書いて", explanation: null, example: "手紙を書いて送る。" },
      },
      { cardId: "c2", term: "見る", options: ["見て", "見って"], type: "conjugation", feedback: { correct: false, correctAnswer: "見て", example: "  " } },
    ],
  });
  assert(st?.questions.length === 2, "Quiz: lượt làm giữ cả câu gõ lẫn câu chọn");
  assert(st?.questions[0].feedback?.example === "手紙を書いて送る。" && st?.questions[0].chosen === "かいて", "Quiz: feedback giữ câu ví dụ + đáp án đã gõ");
  assert(st?.questions[1].feedback?.example === null, "Quiz: ví dụ rỗng -> null");

  // ---------- hiển thị theo loại (không lộ đáp án) ----------
  const look = questionDisplay({ type: "kanji_lookalike", prompt: "Chữ nào...?", inputMode: "choice" });
  assert(!look.showTerm && !look.speakable && look.optionsLang === "ja", "Quiz: kanji giống hình có prompt -> ẩn từ (chính là đáp án), không đọc to");
  const read = questionDisplay({ type: "reading", prompt: null, inputMode: "typing" });
  assert(read.showTerm && !read.showReading && !read.speakable, "Quiz: câu gõ cách đọc -> hiện từ, ẩn furigana và loa");
  const mean = questionDisplay({ type: "meaning", prompt: null, inputMode: "choice" });
  assert(mean.showTerm && mean.showReading && mean.speakable && mean.optionsLang === undefined, "Quiz: câu nghĩa giữ như cũ");
  assert(questionDisplay({ type: "homophone", prompt: null, inputMode: "choice" }).showTerm, "Quiz: thiếu prompt -> vẫn hiện từ (không để câu trống)");

  // ---------- báo lỗi câu hỏi ----------
  assert(validateFlag(null, "") !== null, "Báo lỗi: phải chọn lý do");
  assert(validateFlag("OTHER", "   ") !== null && validateFlag("OTHER", "sai nghĩa") === null, "Báo lỗi: Khác bắt buộc mô tả");
  assert(validateFlag("TYPO", "") === null && validateFlag("TYPO", "x".repeat(501)) !== null, "Báo lỗi: mô tả tuỳ chọn, ≤ 500");
  assert(JSON.stringify(buildFlagRequest("TYPO", "  ")) === '{"reason":"TYPO"}', "Báo lỗi: mô tả rỗng không gửi");
  assert(buildFlagRequest("OTHER", " abc ").detail === "abc", "Báo lỗi: cắt khoảng trắng mô tả");
  assert(!flagReasonsFor("typing").includes("BAD_DISTRACTOR") && flagReasonsFor("choice").length === 4, "Báo lỗi: câu gõ không có lý do câu nhiễu");
  // Lỗi dạng axios (không import axios): { response: { status, data: { message } } }.
  const httpErr = (status: number, message?: string) => ({ response: { status, data: message ? { status, message } : "" } });
  assert(/rồi/.test(flagErrorMessage(httpErr(409)) ?? "") && /20/.test(flagErrorMessage(httpErr(429)) ?? ""), "Báo lỗi: 409 / 429 body trống -> câu dự phòng");
  const dupFlag = "Bạn đã báo lỗi câu hỏi này, quản trị viên đang xem xét.";
  const flagLimit = "Bạn đã gửi quá nhiều báo lỗi câu hỏi, vui lòng thử lại sau.";
  assert(flagErrorMessage(httpErr(409, dupFlag)) === dupFlag && flagErrorMessage(httpErr(429, flagLimit)) === flagLimit, "Báo lỗi: 409 / 429 có message -> đúng câu của server");
  assert(flagErrorMessage(httpErr(400, "Lý do không hợp lệ")) === "Lý do không hợp lệ", "Báo lỗi: 400 -> thông điệp server");
  assert(flagErrorMessage(httpErr(404, "Không tìm thấy câu hỏi.")) === "Không tìm thấy câu hỏi.", "Báo lỗi: 404 nghiệp vụ (thẻ đã xoá) -> lỗi thật của server, không phải đang cập nhật");
  assert(flagErrorMessage(new Error("Network Error")) === null, "Báo lỗi: lỗi mạng -> null (nơi gọi dùng extractErrorMessage)");

  // ---------- lỗi HTTP / sinh câu nhiễu ----------
  assert(/AI/.test(distractorErrorMessage(httpErr(503, "Không kết nối được dịch vụ AI (distractors).")) ?? "") && distractorErrorMessage(httpErr(500)) === null, "Câu nhiễu: 503 -> dịch vụ AI tạm dừng (không lộ câu cho người vận hành)");
  assert(distractorErrorMessage(new Error("x")) === null, "Câu nhiễu: lỗi mạng -> null (nơi gọi dùng thông điệp chung)");
  assert(
    distractorErrorMessage(httpErr(403, "Bạn chỉ có quyền xem bộ thẻ này.")) === "Bạn chỉ có quyền xem bộ thẻ này." &&
      /quyền sửa/.test(distractorErrorMessage(httpErr(403)) ?? ""),
    "Câu nhiễu: 403 -> câu của server; body trống -> câu dự phòng"
  );
  const dr = parseDistractorResult({ updated: 10, withLookalike: 4, withHomophone: "2" });
  assert(dr.withHomophone === 2 && /10 thẻ/.test(describeDistractorResult(dr)), "Câu nhiễu: tóm tắt kết quả");
  assert(/Không có thẻ/.test(describeDistractorResult(parseDistractorResult(null))), "Câu nhiễu: response hỏng -> 0, câu báo không có gì");

  // ---------- bộ sửa câu hỏi (admin) ----------
  assert(validateQuestionOptions(["a", "b"], "a") === null, "Admin câu hỏi: hợp lệ");
  assert(validateQuestionOptions(["a", "b"], "c") !== null, "Admin câu hỏi: correct phải ∈ options");
  assert(validateQuestionOptions(["a", " a "], "a") !== null, "Admin câu hỏi: phương án trùng (sau khi cắt khoảng trắng)");
  assert(validateQuestionOptions(["a", ""], "a") !== null && validateQuestionOptions(["a"], "a") !== null, "Admin câu hỏi: trống / < 2 phương án");
  assert(validateQuestionOptions([], "かく") === null && validateQuestionOptions([], " ") !== null, "Admin câu hỏi: câu gõ chỉ cần đáp án");

  const row = normalizeAdminQuestion({
    id: "q1", deckId: "d1", deckTitle: null, cardId: "c1", term: "書く", kind: "CONJUGATION", prompt: "Thể て của 書く",
    options: ["書いて", "書きて", 3 as unknown as string], correct: "書いて", status: "WEIRD" as "ACTIVE", flagCount: 2,
    openFlags: undefined as unknown as number, generator: "RULE", updatedAt: null,
  } satisfies AdminQuestionRow);
  assert(row.options.length === 2 && row.status === "ACTIVE" && row.openFlags === 0, "Admin câu hỏi: dòng hỏng được chuẩn hoá");
  const draft = toQuestionDraft(row);
  assert(draft.correctIndex === 0 && !draft.typing, "Admin câu hỏi: đáp án đúng theo vị trí");
  assert(Object.keys(buildQuestionPatch(row, draft)).length === 0, "Admin câu hỏi: không đổi -> patch rỗng");
  const renamed = { ...draft, options: ["書いて ", "書けて"] };
  assert(
    JSON.stringify(buildQuestionPatch(row, renamed)) === '{"options":["書いて","書けて"],"correct":"書いて"}',
    "Admin câu hỏi: đổi phương án -> gửi kèm correct (đã cắt khoảng trắng)"
  );
  assert(JSON.stringify(buildQuestionPatch(row, { ...draft, correctIndex: 1 })) === '{"correct":"書きて"}', "Admin câu hỏi: chỉ đổi đáp án đúng");
  assert(buildQuestionPatch(row, { ...draft, prompt: " Thể て của 書く " }).prompt === undefined, "Admin câu hỏi: khoảng trắng thừa ở prompt không tính là sửa");
  assert(validateQuestionDraft({ ...draft, correctIndex: -1 }) !== null, "Admin câu hỏi: chưa chọn đáp án đúng -> lỗi");
  const typingDraft = toQuestionDraft({ prompt: null, options: [], correct: "かく" });
  assert(typingDraft.typing && JSON.stringify(buildQuestionPatch({ prompt: null, options: [], correct: "かく" }, { ...typingDraft, correctText: "かく " })) === "{}", "Admin câu hỏi: câu gõ, sửa khoảng trắng -> không đổi");
  assert(optionLetter(0) + optionLetter(3) === "AD", "Admin câu hỏi: nhãn phương án A, B, C...");
}
