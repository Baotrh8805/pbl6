// Self-check trang admin đợt 2 (hợp đồng API đợt 2: §3 xác thực email, §4 mẹo nhớ, §5 nguồn tri thức, §6 khiếu nại,
// §8 thống kê AI). scripts/selfCheck.ts gọi runAdminChecks(assert). Chỉ hàm thuần; import tương đối + đuôi .ts để node
// chạy trực tiếp (node --experimental-strip-types).
import { SERVER_PENDING_MESSAGE, isEndpointMissing } from "../../src/lib/apiErrorInfo.ts";
import { adminAccountStatus } from "../../src/features/admin/adminUtils.ts";
import type { AccountAppeal } from "../../src/types/adminModeration.types.ts";
import {
  aiEngineRows,
  appealActionState,
  appealLockLabel,
  canDeleteKnowledge,
  canReviewMnemonic,
  confidencePct,
  engineHealthLabel,
  engineHealthList,
  enrichSummary,
  extractEngineLabel,
  filterKnowledgeEntries,
  formatPct,
  formatSeconds,
  isPendingError,
  knowledgeUploadError,
  mnemonicSourceLabel,
  mnemonicTextError,
  normalizeAppeal,
  ocrChartRows,
  ocrErrorPct,
  ocrOverallErrorPct,
  parseAppealStatus,
  parseMnemonicStatus,
  queueCounts,
  ratePct,
  rejectNoteError,
} from "../../src/features/admin/moderationUtils.ts";

export function runAdminChecks(assert: (cond: boolean, msg: string) => void): void {
  // ---------- endpoint chưa triển khai (quy tắc chung ở lib/apiErrorInfo, kiểm kỹ trong practice.ts) ----------
  const httpErr = (status: number, message?: string) => ({ response: { status, data: message ? { status, message } : "" } });
  assert(
    isEndpointMissing(httpErr(404, "No static resource api/admin/knowledge-sources/1.")) &&
      isEndpointMissing(httpErr(404)) &&
      !isEndpointMissing(httpErr(404, "Không tìm thấy nguồn tri thức.")) &&
      isEndpointMissing(httpErr(405, "Không tìm thấy")) &&
      !isEndpointMissing(httpErr(500)),
    "Admin: 404 chỉ coi là chưa triển khai khi thân lỗi là của Spring / rỗng; 405 luôn là chưa có"
  );
  assert(isPendingError(SERVER_PENDING_MESSAGE) && !isPendingError("Lỗi khác") && !isPendingError(undefined), "Nhận ra lỗi 'đang cập nhật'");

  // ---------- §3 tài khoản đã tự xoá (deleted) ----------
  const lockedAt = "2026-10-19T00:00:00Z";
  assert(
    adminAccountStatus({ lockedAt, deleted: true }) === "deleted" &&
      adminAccountStatus({ lockedAt, deleted: false }) === "locked" &&
      adminAccountStatus({ lockedAt: null, deleted: false }) === "active",
    "Đã tự xoá thắng 'bị khoá' (cũng có lockedAt nhưng backend 409 khi mở khoá / Premium / vai trò) -> nhãn 'Đã xoá', ẩn nút"
  );
  assert(adminAccountStatus({ lockedAt }) === "locked" && adminAccountStatus({ lockedAt: null }) === "active", "Thiếu deleted (backend cũ) = chưa xoá");

  // ---------- tỉ lệ & định dạng ----------
  assert(
    [ratePct(3, 40), ratePct(0, 0), ratePct(5, 0), ratePct(50, 40), ratePct(null, 10), ratePct(1, 3)].join() === "7.5,,,100,,33.3",
    "ratePct: làm tròn 0.1, kẹp 100, mẫu số 0 / thiếu số -> null"
  );
  assert(`${formatPct(7.5)}|${formatPct(null)}|${formatPct(100)}` === "7,5%|—|100%", "formatPct: dấu phẩy thập phân kiểu Việt");
  assert([confidencePct(0.873), confidencePct(87.3), confidencePct(null), confidencePct(1)].join() === "87.3,87.3,,100", "Độ tin cậy 0..1 hoặc đã nhân 100");
  assert(
    `${formatSeconds(0.8)}|${formatSeconds(125)}|${formatSeconds(120)}|${formatSeconds(null)}` === "0,8 giây|2 phút 5 giây|2 phút|—",
    "formatSeconds: giây / phút"
  );

  // ---------- §8 engine ----------
  assert(
    `${extractEngineLabel("pdf-text")}|${extractEngineLabel("weird")}|${extractEngineLabel(null)}` === "PDF có lớp chữ|weird|Không rõ",
    "Nhãn engine đọc văn bản, khoá lạ giữ nguyên"
  );
  assert(`${engineHealthLabel("sudachi")}|${engineHealthLabel("kanjivg")}|${engineHealthLabel("newThing")}` === "Tách từ Sudachi|Nét chữ KanjiVG|newThing", "Nhãn thành phần ai-service");
  const health = engineHealthList({ zeta: true, gemini: false, sudachi: true, tesseract: true, note: "x" } as Record<string, unknown>);
  assert(
    health.map((h) => `${h.key}:${h.ok}`).join() === "tesseract:true,gemini:false,sudachi:true,zeta:true",
    "Cờ thành phần: theo thứ tự khai báo, khoá lạ cuối, bỏ giá trị không phải boolean"
  );
  assert(engineHealthList(undefined).length === 0 && engineHealthList(null).length === 0, "Backend cũ không có engines -> []");
  const rows = aiEngineRows([
    { engine: "gemini", total: 10, failed: 1, lowConfidence: 0, avgConfidence: null, avgSeconds: 4.25 },
    { engine: "tesseract", total: 40, failed: 3, lowConfidence: 10, avgConfidence: 0.82, avgSeconds: null },
  ]);
  assert(
    rows.map((r) => `${r.engine}:${r.failedPct}:${r.lowPct}:${r.avgConfidencePct}:${r.avgSeconds}`).join("|") ===
      "tesseract:7.5:25:82:null|gemini:10:0:null:4.25",
    "Bảng engine: nhiều lượt lên đầu, % lỗi / tin cậy thấp, null giữ null"
  );
  assert(aiEngineRows(undefined).length === 0, "Không có ai.engines -> bảng rỗng");
  const enrich = enrichSummary({ total: 10, enriched: 7, quota: 2, error: 0 });
  assert(!!enrich && enrich.enrichedPct === 70 && enrich.other === 1, "Tóm tắt dịch nghĩa: % thành công + phần còn lại");
  assert(enrichSummary(undefined) === null && enrichSummary({ enriched: 1 }) === null, "Thiếu enrich.total -> ẩn");

  // ---------- §8 OCR ----------
  assert(
    [
      ocrErrorPct({ date: "d", ocrJobs: 100, failed: 1, errorRate: 1 }),
      ocrErrorPct({ date: "d", ocrJobs: 4, failed: 4, errorRate: 1 }),
      ocrErrorPct({ date: "d", ocrJobs: 4, failed: 1, errorRate: 0.25 }),
      ocrErrorPct({ date: "d", ocrJobs: 4, failed: 1, errorRate: 25 }),
      ocrErrorPct({ date: "d", ocrJobs: 4, failed: 1 }),
      ocrErrorPct({ date: "d", ocrJobs: 0, failed: 0, errorRate: 0 }),
      ocrErrorPct({ date: "d", ocrJobs: 0, errorRate: 0.5 }),
    ].join() === "1,100,25,25,25,0,50",
    "errorRate: tự nhận dạng phân số / %, thiếu thì tính failed/ocrJobs"
  );
  const ocr = ocrChartRows([
    { date: "2026-10-17", ocrJobs: 2, failed: 1, lowConfidence: 0, geminiFallback: 1, errorRate: 0.5 },
    { date: "2026-10-18", ocrJobs: 0, failed: 0, lowConfidence: 0, geminiFallback: 0, errorRate: null },
    { date: "2026-10-19", ocrJobs: 8, failed: 1, lowConfidence: 2, geminiFallback: 0, errorRate: 0.1 },
  ]);
  assert(ocr.map((r) => r.errorPct).join() === "50,0,10" && ocr[0].geminiFallback === 1, "Chuỗi OCR cho biểu đồ (%)");
  assert(ocrOverallErrorPct(ocr) === 18 && ocrOverallErrorPct([]) === null, "Tỉ lệ lỗi cả kỳ có trọng số theo số lượt; không lượt -> null");
  assert(ocrChartRows(undefined).length === 0, "Backend cũ không có ocrSeries -> ẩn biểu đồ");

  // ---------- hàng đợi ----------
  const qOld = queueCounts({ openReports: 2 });
  assert(
    qOld.pendingMnemonics === null && qOld.openAppeals === null && qOld.openQuestionFlags === null && qOld.openReports === 2,
    "Stats cũ: thiếu bộ đếm mới -> null (ẩn thẻ / badge)"
  );
  const qNew = queueCounts({ pendingMnemonics: 3, openAppeals: 0, openQuestionFlags: 5, openReports: 0 });
  assert(`${qNew.pendingMnemonics},${qNew.openAppeals},${qNew.openQuestionFlags}` === "3,0,5", "Stats mới: 0 vẫn là số (thẻ hiện 0)");

  // ---------- §4 mẹo nhớ ----------
  assert(
    [parseMnemonicStatus("APPROVED"), parseMnemonicStatus("x"), parseMnemonicStatus(null)].join() === "APPROVED,PENDING,PENDING",
    "Tab mẹo nhớ: giá trị lạ -> hàng đợi chờ duyệt"
  );
  assert(`${mnemonicSourceLabel("AI")}|${mnemonicSourceLabel("TEMPLATE")}|${mnemonicSourceLabel("USER")}` === "AI|Mẫu|Người dùng", "Chip nguồn mẹo");
  assert(!!mnemonicTextError("   ") && !!mnemonicTextError("a".repeat(501)) && mnemonicTextError(" Nước ở bên ") === null, "Sửa mẹo: không rỗng, ≤ 500");
  assert(!!rejectNoteError(" ") && !!rejectNoteError("x".repeat(501)) && rejectNoteError("Sai bộ thủ") === null, "Từ chối bắt buộc ghi chú ≤ 500");
  assert(
    [
      canReviewMnemonic("PENDING", "ADMIN"),
      canReviewMnemonic("PENDING", "SUPER_ADMIN"),
      canReviewMnemonic("APPROVED", "SUPER_ADMIN"),
      canReviewMnemonic("PENDING", "USER"),
      canReviewMnemonic("PENDING", undefined),
    ].join() === "true,true,false,false,false",
    "Chỉ staff duyệt / sửa mẹo PENDING"
  );

  // ---------- §5 nguồn tri thức ----------
  const base = { source: "file" as const, file: { size: 1000 }, text: "", title: "Từ vựng N5", kind: "VOCAB" };
  assert(knowledgeUploadError(base) === null, "Tải nguồn hợp lệ");
  assert(!!knowledgeUploadError({ ...base, title: "  " }), "Thiếu tiêu đề");
  assert(!!knowledgeUploadError({ ...base, title: "t".repeat(201) }), "Tiêu đề > 200");
  assert(!!knowledgeUploadError({ ...base, kind: "BOOK" }), "Loại lạ");
  assert(!!knowledgeUploadError({ ...base, file: null }), "Chưa chọn tệp");
  assert(!!knowledgeUploadError({ ...base, file: { size: 2 * 1024 * 1024 + 1 } }), "Tệp > 2 MB");
  assert(!!knowledgeUploadError({ ...base, source: "text", text: " " }) && knowledgeUploadError({ ...base, source: "text", file: null, text: "日本" }) === null, "Dán văn bản: không rỗng, không cần tệp");
  assert(!canDeleteKnowledge("ADMIN") && canDeleteKnowledge("SUPER_ADMIN") && !canDeleteKnowledge(undefined), "Xoá nguồn: chỉ SUPER_ADMIN");
  const entries = [
    { term: "海", reading: "うみ", meaning: "biển", level: "N5" },
    { term: "池", reading: "いけ", meaning: "ao", level: null },
  ];
  assert(
    filterKnowledgeEntries(entries, "").length === 2 && filterKnowledgeEntries(entries, "いけ")[0].term === "池" && filterKnowledgeEntries(entries, "BIỂN").length === 1,
    "Lọc mục theo từ / cách đọc / nghĩa, không phân biệt hoa thường"
  );

  // ---------- §6 khiếu nại ----------
  assert([parseAppealStatus("DISMISSED"), parseAppealStatus("zzz")].join() === "DISMISSED,OPEN", "Tab khiếu nại mặc định OPEN");
  assert(
    [
      appealLockLabel({ userId: null, userLocked: null }),
      appealLockLabel({ userId: 1, userLocked: true }),
      appealLockLabel({ userId: 1, userLocked: false }),
    ].join("|") === "Không còn tài khoản|Đang khoá|Đã mở khoá",
    "Nhãn trạng thái tài khoản của khiếu nại"
  );
  const open = { status: "OPEN", userId: 7, userLocked: true };
  const st = (appeal: { status: string; userId: number | null; userLocked: boolean | null }, target: string | null | undefined, viewer: string | undefined) => {
    const s = appealActionState(appeal, target, viewer);
    return `${s.canHandle}:${s.canUnlock}`;
  };
  assert(st({ ...open, status: "RESOLVED" }, "USER", "SUPER_ADMIN") === "false:false", "Khiếu nại đã đóng: không thao tác");
  assert(st(open, "USER", "USER") === "false:false" && st(open, "USER", undefined) === "false:false", "Người xem không phải staff / chưa tải vai trò: không thao tác");
  assert(st(open, "USER", "ADMIN") === "true:true", "ADMIN mở khoá được USER");
  const staffByAdmin = appealActionState(open, "ADMIN", "ADMIN");
  assert(!staffByAdmin.canUnlock && staffByAdmin.canHandle && /Super admin/.test(staffByAdmin.unlockHint ?? ""), "ADMIN không mở khoá được staff (vẫn giữ khoá / bỏ qua được)");
  assert(st(open, "ADMIN", "SUPER_ADMIN") === "true:true", "SUPER_ADMIN mở khoá được ADMIN");
  const sameRank = appealActionState(open, "SUPER_ADMIN", "SUPER_ADMIN");
  assert(!sameRank.canUnlock && /cùng bậc/.test(sameRank.unlockHint ?? ""), "Không mở khoá người cùng bậc (quy tắc bậc backend)");
  assert(appealActionState(open, undefined, "SUPER_ADMIN").canUnlock === false, "Đang tra vai trò: tạm khoá nút Mở khoá");
  assert(st(open, null, "ADMIN") === "true:false" && st(open, null, "SUPER_ADMIN") === "true:true", "Không tra được vai trò: chỉ Super admin được thử");
  assert(
    appealActionState({ ...open, userId: null }, null, "SUPER_ADMIN").canUnlock === false &&
      appealActionState({ ...open, userLocked: false }, "USER", "SUPER_ADMIN").canUnlock === false,
    "Không còn tài khoản / đã mở khoá: không còn gì để mở"
  );
  // NON_NULL: tài khoản đã xoá đến KHÔNG có userId / userLocked -> phải được coi là "không còn tài khoản".
  const deleted = normalizeAppeal({
    id: 3,
    email: "x@y.z",
    message: "Xin mở khoá",
    status: "OPEN",
    createdAt: "2026-10-19T00:00:00Z",
  } as unknown as AccountAppeal);
  assert(
    deleted.userId === null && deleted.userLocked === null && deleted.resolvedAt === null && deleted.email === "x@y.z",
    "normalizeAppeal: trường vắng (NON_NULL) -> null"
  );
  assert(
    appealLockLabel({ userLocked: undefined }) === "Không còn tài khoản" &&
      appealActionState({ status: "OPEN" }, null, "SUPER_ADMIN").canUnlock === false,
    "Khiếu nại chưa chuẩn hoá thiếu userId: vẫn là 'không còn tài khoản', không bật Mở khoá"
  );
}
