// Chống gửi trùng khi bấm đúp (LP-13). Cờ `saving` / `activating` trong state chỉ có hiệu lực từ lần render kế tiếp: hai cú
// click (hoặc Enter lặp) rơi vào cùng khung render vẫn chạy handler hai lần -> 2 lần kích hoạt = 2 thư mục + 2 bộ bộ thẻ,
// 2 lần tạo lộ trình = tốn 2 lượt bóc tách. Tập khoá giữ trong useRef, đọc / ghi đồng bộ nên lần gọi thứ hai thấy ngay.
// Hàm thuần, import tương đối để scripts/selfCheck.ts chạy bằng node.

/**
 * Chạy `task` khi chưa có thao tác cùng `key` đang chạy; đang chạy thì bỏ qua (trả undefined), không xếp hàng chạy sau.
 * Khoá nhả khi task xong hoặc ném lỗi (lỗi vẫn ném ra cho nơi gọi). Kiểm và giữ khoá nằm trước `await` đầu tiên nên hai lần
 * gọi liền nhau trong cùng một lượt xử lý sự kiện cũng chỉ một lần chạy.
 */
export async function runOnce<T>(inFlight: Set<string>, key: string, task: () => Promise<T>): Promise<T | undefined> {
  if (inFlight.has(key)) return undefined;
  inFlight.add(key);
  try {
    return await task();
  } finally {
    inFlight.delete(key);
  }
}
