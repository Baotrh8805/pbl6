// Self-check link riêng (D9) + xuất bộ thẻ (UC-29), kế hoạch 2026-10-26 B1 / B2: URL /d/<token>, tên tệp từ Content-Disposition.
// scripts/selfCheck.ts gọi: runDeckShareChecks(assert).
import { fileNameFromDisposition, shareLinkUrl } from "../../src/services/deckShareService.ts";

export function runDeckShareChecks(assert: (cond: boolean, msg: string) => void): void {
  const token = "AbC_-0123456789abcdefghijklmnopqrstuvwxyzAB";
  assert(shareLinkUrl("https://nihongen.app", token) === `https://nihongen.app/d/${token}`, "Link riêng: origin + /d/<token>");
  assert(shareLinkUrl("http://localhost:5173/", token) === `http://localhost:5173/d/${token}`, "Link riêng: bỏ / cuối origin");

  const star = "attachment; filename=\"bai-1-2026-10-26.csv\"; filename*=UTF-8''bai-1-2026-10-26.csv";
  assert(fileNameFromDisposition(star, "x.csv") === "bai-1-2026-10-26.csv", "Xuất: ưu tiên filename* UTF-8");
  assert(fileNameFromDisposition("attachment; filename*=UTF-8''%E6%97%A5.txt", "x") === "日.txt", "Xuất: giải mã filename* %XX");
  assert(fileNameFromDisposition('attachment; filename="bo-the-anki.txt"', "x") === "bo-the-anki.txt", "Xuất: filename thường khi không có filename*");
  assert(fileNameFromDisposition(undefined, "bo-the.csv") === "bo-the.csv", "Xuất: thiếu header → tên mặc định");
  assert(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4", "f.csv") === "f.csv", "Xuất: filename* hỏng, không có filename → mặc định");
}
