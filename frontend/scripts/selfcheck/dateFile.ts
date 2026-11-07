// Self-check B5.6: tên tệp xuất theo giờ máy. Đặt TZ = Asia/Saigon lúc chạy (Node đọc lại múi giờ khi process.env.TZ đổi) để
// kiểm đúng ca "đã sang ngày mới theo UTC nhưng chưa theo giờ máy" và ngược lại. scripts/selfCheck.ts gọi runDateFileChecks(assert).
import { datedFileName, fileSlug, localDateStamp } from "../../src/lib/dateFile.ts";

export function runDateFileChecks(assert: (cond: boolean, msg: string) => void): void {
  const prevTz = process.env.TZ;
  process.env.TZ = "Asia/Saigon";
  try {
    const lateEvening = new Date("2026-10-27T18:30:00Z");   // 01:30 ngày 28/10 giờ Việt Nam
    const earlyMorning = new Date("2026-10-27T16:30:00Z");  // 23:30 ngày 27/10 giờ Việt Nam
    const tzWorks = lateEvening.getHours() === 1;
    assert(tzWorks, "Selfcheck chạy được với TZ=Asia/Saigon (Node đọc lại process.env.TZ)");
    if (tzWorks) {
      assert(localDateStamp(lateEvening) === "2026-10-28", "Giờ máy: 18:30Z = 01:30 ngày 28 ở Việt Nam -> 2026-10-28 (toISOString sẽ ghi 27)");
      assert(localDateStamp(earlyMorning) === "2026-10-27", "Giờ máy: 16:30Z vẫn là 23:30 ngày 27 ở Việt Nam -> 2026-10-27");
      assert(lateEvening.toISOString().slice(0, 10) === "2026-10-27", "Đối chứng: toISOString cho ngày UTC (sai với người dùng Việt Nam)");
    }
    assert(datedFileName("bao-cao-open", "csv", earlyMorning) === "bao-cao-open-2026-10-27.csv", "Tên tệp: tiền tố + ngày + đuôi");
    assert(datedFileName("Bộ thẻ N5", ".txt", earlyMorning) === "bo-the-n5-2026-10-27.txt", "Tên tệp: tiền tố có dấu -> slug; đuôi bỏ dấu chấm thừa");
    assert(fileSlug("  Đồ thị / Tri thức!! ") === "do-thi-tri-thuc" && fileSlug("***") === "tep", "Slug: bỏ dấu, đ -> d, ký tự lạ -> gạch nối, rỗng -> 'tep'");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(localDateStamp()), "Mặc định: hôm nay theo giờ máy, đúng dạng yyyy-mm-dd");
  } finally {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  }
}
