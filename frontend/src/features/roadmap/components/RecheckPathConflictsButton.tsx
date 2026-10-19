import React from "react";
import { recheckConflicts } from "@/services/learningPathService";
import { RecheckConflictsButton } from "@/features/extraction/components/RecheckConflictsButton";
import type { LearningPath } from "@/types/api.types";

interface RecheckPathConflictsButtonProps {
  pathId: string;
  /** Lộ trình server trả sau khi kiểm tra lại (thay state trang + tải lại danh sách mục của chương đang mở). */
  onUpdated: (path: LearningPath) => void;
  disabled?: boolean;
}

// F2 cho bản nháp lộ trình: "Kiểm tra lại" mâu thuẫn của mọi mục trong lộ trình với nguồn tri thức chuẩn ACTIVE.
// Trang lộ trình chỉ cần đặt nút này cạnh các thao tác của bản nháp (PathDraftEditor) và nhận lộ trình mới qua onUpdated.
export const RecheckPathConflictsButton: React.FC<RecheckPathConflictsButtonProps> = ({ pathId, onUpdated, disabled }) => (
  <RecheckConflictsButton
    label="Kiểm tra lại mâu thuẫn"
    disabled={disabled}
    onRecheck={async () => onUpdated(await recheckConflicts(pathId))}
  />
);
