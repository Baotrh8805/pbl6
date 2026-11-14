import React from "react";
import type { ExtractionStatus } from "@/types/api.types";
import { STATUS_LABELS } from "../extractionUtils";

const TONE: Record<ExtractionStatus, string> = {
  QUEUED: "bg-surface-container-high text-on-surface-variant",
  RUNNING: "bg-primary-fixed text-on-primary-fixed",
  DONE: "bg-secondary-container/50 text-on-secondary-container",
  FAILED: "bg-error-container text-on-error-container",
  CANCELLED: "bg-surface-container text-outline",
};

export const ExtractionStatusBadge: React.FC<{ status: ExtractionStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold ${TONE[status]}`}>
    {status === "RUNNING" && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
    {STATUS_LABELS[status]}
  </span>
);
