import React from "react";
import { Button } from "@/components/ui/Button";
import type { LearningPath } from "@/types/api.types";

interface PathFailedPanelProps {
  path: LearningPath;
  /** POST /retry: chạy lại từ bước phân tích trên văn bản đã bóc (không tốn lượt), trang poll như lúc tạo. */
  onRetry: () => void;
  /** Mở modal tạo mới với tài liệu khác (job đã mất văn bản, hoặc muốn đổi tài liệu). */
  onRecreate: () => void;
  onDelete: () => void;
  busy: boolean;
  retrying: boolean;
  /** Lỗi của lần "Chạy lại" gần nhất (400 "Hãy tạo lại…" khi job không còn văn bản). */
  error: string | null;
}

export const PathFailedPanel: React.FC<PathFailedPanelProps> = ({
  path,
  onRetry,
  onRecreate,
  onDelete,
  busy,
  retrying,
  error,
}) => {
  // Spec 21/10: dịch vụ AI quá tải ở bước OCR -> chưa có văn bản để "Chạy lại", lượt không bị tính; chỉ còn "Tạo lại" / "Xoá".
  const overloaded = path.job?.failureKind === "AI_OVERLOADED";
  return (
    <div className="p-space-md rounded-2xl bg-error/5 border border-error/20 flex flex-col gap-3">
      <p className="text-body-md text-error font-semibold">Xử lý thất bại</p>
      <p className="text-body-sm text-on-surface">
        {overloaded
          ? "Dịch vụ AI đang quá tải, lượt này không bị tính vào hạn mức. Hãy tạo lại sau vài phút."
          : path.errorMessage || path.job?.errorMessage || "Không rõ nguyên nhân."}
      </p>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm break-words">
          Chưa chạy lại được: {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!overloaded && (
          <Button variant="primary" size="sm" onClick={onRetry} isLoading={retrying} disabled={busy}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">replay</span>
            Chạy lại
          </Button>
        )}
        <Button variant={overloaded ? "primary" : "outline"} size="sm" onClick={onRecreate} disabled={busy || retrying}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
          Tạo lại
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} disabled={busy || retrying}>
          Xoá
        </Button>
      </div>
      <p className="text-label-sm text-on-surface-variant">
        {overloaded
          ? "\"Tạo lại\" tải tài liệu lên lần nữa; lượt vừa lỗi do hệ thống không bị trừ vào hạn mức."
          : "\"Chạy lại\" phân tích lại văn bản đã bóc, không tốn lượt hạn mức; \"Tạo lại\" dùng tài liệu mới (tốn một lượt)."}
      </p>
    </div>
  );
};
