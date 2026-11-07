import React from "react";
import type { LearningPath } from "@/types/api.types";
import { StageStepper } from "@/features/extraction/components/StageStepper";

export const PathProcessingPanel: React.FC<{ path: LearningPath }> = ({ path }) => (
  <div className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-space-md">
    <StageStepper status={path.job?.status ?? "QUEUED"} stage={path.job?.stage ?? "QUEUED"} />
    <p className="text-body-sm text-on-surface-variant" aria-live="polite">
      Hệ thống đang đọc tài liệu và chia chương, bạn có thể rời trang và quay lại sau.
    </p>
  </div>
);
