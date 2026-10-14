import React from "react";
import { Button } from "@/components/ui/Button";
import type { LearningPath } from "@/types/api.types";

interface PathFailedPanelProps {
  path: LearningPath;
  onRetry: () => void;
  onDelete: () => void;
  busy: boolean;
}

export const PathFailedPanel: React.FC<PathFailedPanelProps> = ({ path, onRetry, onDelete, busy }) => (
  <div className="p-space-md rounded-2xl bg-error/5 border border-error/20 flex flex-col gap-3">
    <p className="text-body-md text-error font-semibold">Xử lý thất bại</p>
    <p className="text-body-sm text-on-surface">
      {path.errorMessage || path.job?.errorMessage || "Không rõ nguyên nhân."}
    </p>
    <div className="flex gap-2">
      <Button variant="primary" size="sm" onClick={onRetry} disabled={busy}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">replay</span>
        Thử lại
      </Button>
      <Button variant="outline" size="sm" onClick={onDelete} disabled={busy}>
        Xoá
      </Button>
    </div>
  </div>
);
