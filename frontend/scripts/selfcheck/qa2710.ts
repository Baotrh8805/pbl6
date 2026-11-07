// Self-check rà soát 27/10: chính sách mật khẩu, nhãn thời gian, sắp xếp / lọc bộ thẻ và thẻ, nhập dữ liệu với dấu cách đọc riêng.
// scripts/selfCheck.ts gọi: runQa2710Checks(assert). Hàm thuần, import tương đối + đuôi .ts.
import { PASSWORD_POLICY_MESSAGE, passwordPolicyError, passwordStrength } from "../../src/lib/passwordRules.ts";
import { dayDiff, relativeDayLabel, withinDays } from "../../src/lib/timeLabel.ts";
import { dueByDeck, filterDecks, sortCards, sortDecks } from "../../src/features/decks/deckListUtils.ts";
import { parseImportText, splitParenReading } from "../../src/features/decks/editor/importParser.ts";
import type { Deck } from "../../src/types/api.types.ts";

export function runQa2710Checks(assert: (cond: boolean, msg: string) => void): void {
  // ---------- mật khẩu ----------
  assert(passwordPolicyError("Secret123!") === null && passwordPolicyError("mật-khẩu-9") === null, "QA: mật khẩu đủ chữ, số, ký tự đặc biệt hợp lệ (kể cả chữ có dấu)");
  assert(passwordPolicyError("secret123") === PASSWORD_POLICY_MESSAGE, "QA: thiếu ký tự đặc biệt bị chặn");
  assert(passwordPolicyError("Secret!!!") === PASSWORD_POLICY_MESSAGE && passwordPolicyError("Ab1!") === PASSWORD_POLICY_MESSAGE, "QA: thiếu số / quá ngắn bị chặn");
  assert(passwordPolicyError("") !== null && passwordPolicyError(" Secret123! ") !== null, "QA: rỗng / khoảng trắng đầu cuối bị chặn");
  assert(passwordStrength("abc") === 0 && passwordStrength("abcdefgh") === 1 && passwordStrength("abcdef1!") === 1 && passwordStrength("Abcdef1!") === 2 && passwordStrength("Abcdefgh-1234") === 3, "QA: thang độ mạnh 0..3");

  // ---------- nhãn thời gian ----------
  const now = new Date(2026, 9, 27, 15, 0, 0); // 27/10/2026 15:00 giờ máy
  const iso = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString();
  assert(dayDiff(iso(2026, 10, 27, 1), now) === 0 && dayDiff(iso(2026, 10, 26, 23), now) === 1, "QA: dayDiff theo ngày lịch, không theo 24 giờ");
  assert(relativeDayLabel(iso(2026, 10, 27), now) === "Hôm nay" && relativeDayLabel(iso(2026, 10, 26), now) === "Hôm qua", "QA: hôm nay / hôm qua");
  assert(relativeDayLabel(iso(2026, 10, 24), now) === "3 ngày trước" && relativeDayLabel(iso(2026, 10, 10), now) === "2 tuần trước", "QA: ngày / tuần trước");
  assert(relativeDayLabel(iso(2026, 8, 1), now) === "01/08" && relativeDayLabel(iso(2025, 12, 31), now) === "31/12/2025", "QA: xa hơn 30 ngày -> ngày/tháng, khác năm thêm năm");
  assert(relativeDayLabel(null, now) === null && relativeDayLabel("rác", now) === null && relativeDayLabel(iso(2026, 11, 2), now) === "Hôm nay", "QA: thiếu / hỏng -> null; tương lai (lệch giờ) -> hôm nay");
  assert(withinDays(iso(2026, 10, 27), 1, now) && !withinDays(iso(2026, 10, 26), 1, now) && withinDays(iso(2026, 10, 21), 7, now) && !withinDays(iso(2026, 10, 20), 7, now), "QA: withinDays kể cả hôm nay, đúng biên");

  // ---------- bộ thẻ ----------
  const deck = (id: string, title: string, level: string, updatedAt: string | null, cards: string[], createdAt?: string | null): Deck =>
    ({ id, title, level, description: null, cards: cards.map((c, i) => ({ id: c, term: c, reading: null, meaning: "", position: i + 1 })), access: "owner", visibility: "private", updatedAt, createdAt: createdAt ?? updatedAt }) as Deck;
  const a = deck("a", "Bài 2", "N5", iso(2026, 10, 27), ["a1", "a2"]);
  const b = deck("b", "Bài 1", "N3", iso(2026, 10, 20), ["b1"]);
  const c = deck("c", "Âm Hán", "N1", null, ["c1", "c2", "c3"]);
  assert(sortDecks([c, b, a], "updated").map((d) => d.id).join() === "a,b,c", "QA: mặc định mới cập nhật trước, thiếu mốc xếp cuối");
  assert(sortDecks([a, b, c], "title").map((d) => d.id).join() === "c,b,a", "QA: tên A→Z theo tiếng Việt");
  assert(sortDecks([c, a, b], "level").map((d) => d.id).join() === "a,b,c", "QA: cấp N5 trước N1");
  assert(sortDecks([a, b, c], "cards").map((d) => d.id).join() === "c,a,b", "QA: nhiều thẻ nhất trước");
  const due = dueByDeck([a, b, c], { a1: { cardId: "a1", reps: 1, intervalDays: 1, ease: 2.5, dueAt: iso(2026, 10, 26) }, b1: { cardId: "b1", reps: 1, intervalDays: 1, ease: 2.5, dueAt: iso(2026, 12, 1) } }, now);
  assert(due.a === 1 && due.b === 0 && due.c === 0, "QA: đếm thẻ đã học đến hạn từng bộ (thẻ chưa học không tính)");
  assert(filterDecks([a, b, c], { dueOnly: true }, due).map((d) => d.id).join() === "a", "QA: lọc cần ôn");
  assert(filterDecks([a, b, c], { period: "7d" }, due, now).map((d) => d.id).join() === "a", "QA: lọc 7 ngày theo mốc cập nhật");
  assert(filterDecks([a, b, c], { period: "30d", level: "N3" }, due, now).map((d) => d.id).join() === "b" && filterDecks([a, b, c], { q: "hán" }, due, now).map((d) => d.id).join() === "c", "QA: lọc cấp + thời gian, tìm không phân biệt hoa thường");
  const cards = [
    { id: "x", position: 1, createdAt: iso(2026, 10, 1) },
    { id: "y", position: 2, createdAt: iso(2026, 10, 27) },
    { id: "z", position: 3, createdAt: null },
  ];
  assert(sortCards(cards, "position").map((k) => k.id).join() === "x,y,z" && sortCards(cards, "newest").map((k) => k.id).join() === "y,x,z" && sortCards(cards, "oldest").map((k) => k.id).join() === "z,x,y", "QA: thẻ xếp theo vị trí / mới / cũ (thiếu mốc dùng vị trí)");

  // ---------- nhập dữ liệu: cách đọc ----------
  assert(splitParenReading("食べる（たべる）").join("|") === "食べる|たべる" && splitParenReading("食べる(たべる)").join("|") === "食べる|たべる" && splitParenReading("食べる").join("|") === "食べる|", "QA: tách cách đọc trong ngoặc (toàn / nửa rộng)");
  const same = parseImportText("犬\tいぬ\tcon chó\n猫\tmèo", "\t", "\n");
  assert(same.length === 2 && same[0].reading === "いぬ" && same[1].reading === null && same[1].meaning === "mèo", "QA: cách cũ (cùng dấu) không đổi");
  const paren = parseImportText("犬（いぬ）\tcon chó\tChó nhà\n猫\tmèo", "\t", "\n", { kind: "paren" });
  assert(paren[0].term === "犬" && paren[0].reading === "いぬ" && paren[0].meaning === "con chó\nChó nhà" && paren[1].reading === null, "QA: cách đọc trong ngoặc, cột sau gộp vào nội dung");
  const delim = parseImportText("犬|いぬ\tcon chó\n猫\tmèo", "\t", "\n", { kind: "delim", value: "|" });
  assert(delim[0].term === "犬" && delim[0].reading === "いぬ" && delim[0].meaning === "con chó" && delim[1].term === "猫" && delim[1].reading === null, "QA: dấu riêng giữa thuật ngữ và cách đọc");
  const none = parseImportText("犬\tいぬ\tcon chó", "\t", "\n", { kind: "none" });
  assert(none[0].reading === null && none[0].meaning === "いぬ\ncon chó", "QA: không có cách đọc -> cột 2 là nội dung");
  const sameAsTerm = parseImportText("犬\tいぬ\tcon chó", "\t", "\n", { kind: "delim", value: "\t" });
  assert(sameAsTerm[0].reading === "いぬ", "QA: dấu cách đọc trùng dấu thuật ngữ -> về cách cũ");
}
