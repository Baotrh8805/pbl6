import React from "react";
import type { LearningPathStatus } from "@/types/api.types";
import { PATH_STATUS_LABELS } from "../roadmapUtils";

const TONE: Record<LearningPathStatus, string> = {
  PROCESSING: "bg-primary-fixed text-on-primary-fixed",
  DRAFT: "bg-surface-container-high text-on-surface-variant",
  ACTIVE: "bg-secondary-container/50 text-on-secondary-container",
  FAILED: "bg-error-container text-on-error-container",
};

export const PathStatusChip: React.FC<{ status: LearningPathStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold ${TONE[status]}`}>
    {status === "PROCESSING" && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
    {PATH_STATUS_LABELS[status]}
  </span>
);
