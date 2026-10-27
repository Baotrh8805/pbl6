import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";

interface RecheckConflictsButtonProps {
  /**
   * Gọi POST …/recheck-conflicts và cập nhật state nơi gọi; ném lỗi khi thất bại (nút tự hiện lỗi). Trả câu kết quả
   * (vd. "Đã kiểm tra lại: không còn mâu thuẫn.") thì nút hiện câu đó; trả void khi nơi gọi tự hiện kết quả.
   */
  onRecheck: () => Promise<string | void>;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}

/**
 * Kết quả lần bấm gần nhất: lỗi thật (đỏ, role="alert") tách khỏi "máy chủ chưa có endpoint" (trung tính, role="status")
 * và câu báo đã kiểm tra xong (role="status").
 */
type Notice = { kind: "error" | "done"; text: string };

// Nút "Kiểm tra lại" mâu thuẫn (F2) dùng chung cho trang bóc tách và bản nháp lộ trình: đối chiếu lại item với nguồn
// tri thức chuẩn ĐANG ACTIVE (admin vừa tải nguồn mới thì kết quả đổi). Tự lo trạng thái chờ + lỗi; backend chưa có
// endpoint (404 chung / 405) thì báo câu bình tĩnh màu trung tính — đây không phải lỗi người dùng cần xử lý.
export const RecheckConflictsButton: React.FC<RecheckConflictsButtonProps> = ({
  onRecheck,
  disabled = false,
  label = "Kiểm tra lại",
  size = "sm",
}) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await onRecheck();
      if (result) setNotice({ kind: "done", text: result });
    } catch (e) {
      setNotice({ kind: "error", text: extractErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2 min-w-0">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => void run()}
        isLoading={busy}
        disabled={disabled}
        title="Đối chiếu lại các mục với nguồn tri thức chuẩn mới nhất"
      >
        {!busy && (
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            fact_check
          </span>
        )}
        {label}
      </Button>
      {notice?.kind === "error" && (
        <span role="alert" className="text-label-sm text-error break-words">
          {notice.text}
        </span>
      )}
      {notice?.kind === "done" && (
        <span role="status" className="inline-flex items-start gap-1 text-label-sm text-on-surface-variant break-words">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary shrink-0">
            task_alt
          </span>
          {notice.text}
        </span>
      )}
    </span>
  );
};
