// Self-check Thư viện cộng đồng (rà soát Cộng đồng & Khám phá 30/10, A2 / A3): bộ lọc giữ trên URL để Back, chia sẻ link và quay
// lại qua sidebar không mất. scripts/selfCheck.ts gọi: runLibraryChecks(assert).
import { LIBRARY_DEFAULTS, LIBRARY_PARAMS, libraryParamsToSearch, parseLibraryParams } from "../../src/features/library/libraryParams.ts";
import { restoreOnEnter } from "../../src/lib/searchMemory.ts";
import { isAlreadySavedError, saveActionOf } from "../../src/features/library/librarySave.ts";

export function runLibraryChecks(assert: (cond: boolean, msg: string) => void): void {
  const empty = parseLibraryParams(new URLSearchParams(""));
  assert(JSON.stringify(empty) === JSON.stringify(LIBRARY_DEFAULTS), "Thư viện: URL trống = bộ lọc mặc định");
  assert(libraryParamsToSearch(LIBRARY_DEFAULTS) === "", "Thư viện: mặc định không ghi gì lên URL");

  const full = parseLibraryParams(new URLSearchParams("q=minna&level=N3&cat=goi&tab=popular&sort=rating&page=3"));
  assert(
    full.q === "minna" && full.level === "N3" && full.category === "goi" && full.tab === "popular" && full.sort === "rating" && full.page === 2,
    "Thư viện: đọc đủ bộ lọc, trang trên URL đếm từ 1"
  );
  assert(
    JSON.stringify(parseLibraryParams(new URLSearchParams(libraryParamsToSearch(full)))) === JSON.stringify(full),
    "Thư viện: ghi rồi đọc lại giữ nguyên bộ lọc"
  );

  const junk = parseLibraryParams(new URLSearchParams("level=N9&cat=xyz&tab=hack&sort=title;drop&page=-4"));
  assert(JSON.stringify(junk) === JSON.stringify(LIBRARY_DEFAULTS), "Thư viện: giá trị lạ / trang âm → mặc định");
  assert(parseLibraryParams(new URLSearchParams("page=abc")).page === 0, "Thư viện: trang không phải số → trang đầu");
  assert(parseLibraryParams(new URLSearchParams("q=" + "x".repeat(150))).q.length === 100, "Thư viện: q tối đa 100 ký tự như backend");

  // quay lại qua sidebar (URL trống) khôi phục bộ lọc đã nhớ; link "Tìm bộ thẻ" (?q=…) từ nơi khác thì không bị đè
  assert(restoreOnEnter(new URLSearchParams(""), "level=N3&sort=rating", LIBRARY_PARAMS)?.get("level") === "N3", "Thư viện: khôi phục bộ lọc đã nhớ");
  assert(restoreOnEnter(new URLSearchParams("q=日"), "level=N3", LIBRARY_PARAMS) === null, "Thư viện: link có ?q= không bị đè");

  // A4: đã lưu → nút "Đã lưu · Mở" dẫn tới bản đã lưu, không cho lưu trùng; 409 DECK_ALREADY_SAVED nhận ra được
  const open = saveActionOf({ savedDeckId: "abc-1" });
  assert(open.kind === "open" && open.href === "/decks/abc-1" && open.label === "Đã lưu · Mở", "Thư viện: đã lưu → mở bản đã lưu");
  assert(saveActionOf({ savedDeckId: null }).kind === "save", "Thư viện: chưa lưu → nút Lưu");
  assert(saveActionOf({ savedDeckId: "a b/c" }).href === "/decks/a%20b%2Fc", "Thư viện: id được mã hoá trong link");
  const conflict = { isAxiosError: true, response: { status: 409, data: { status: 409, code: "DECK_ALREADY_SAVED", message: "x" } } };
  assert(isAlreadySavedError(conflict) && !isAlreadySavedError(new Error("x")), "Thư viện: nhận ra lỗi đã lưu bộ này");
}
