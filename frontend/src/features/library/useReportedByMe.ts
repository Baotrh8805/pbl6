import { useCallback, useEffect, useState } from "react";
import { fetchMyReports } from "@/services/adminService";

/**
 * Đã có báo cáo OPEN của mình cho bộ thẻ này chưa: nút "Báo cáo" giữ trạng thái "Đã báo cáo" sau khi tải lại trang.
 * enabled = false (bộ của mình / không public) thì không gọi API. Lỗi mạng -> coi như chưa báo cáo (gửi lại sẽ nhận 409).
 * Lưu theo deckId để chuyển sang bộ thẻ khác (cùng component) không mang trạng thái của bộ cũ.
 */
export const useReportedByMe = (deckId: string, enabled: boolean) => {
  const [reportedDeckId, setReportedDeckId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchMyReports({ deckId, status: "OPEN", size: 1 })
      .then((p) => alive && p.total > 0 && setReportedDeckId(deckId))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [deckId, enabled]);

  const markReported = useCallback(() => setReportedDeckId(deckId), [deckId]);
  return [reportedDeckId === deckId, markReported] as const;
};
