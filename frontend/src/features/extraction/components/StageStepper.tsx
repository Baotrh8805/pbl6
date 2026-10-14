import React from "react";
import type { ExtractionJob } from "@/types/api.types";
import { STAGE_STEPS, stageIndex } from "../extractionUtils";

// Thanh tiến trình theo job.stage: bước đã qua = tick, bước hiện tại = nhấp nháy, FAILED = đỏ ở bước đang dở.
export const StageStepper: React.FC<{ job: ExtractionJob }> = ({ job }) => {
  const current = job.status === "DONE" ? STAGE_STEPS.length - 1 : stageIndex(job.stage);
  const failed = job.status === "FAILED";

  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-0" aria-label="Tiến trình xử lý">
      {STAGE_STEPS.map((step, i) => {
        const done = job.status === "DONE" || i < current;
        const active = !done && i === current;
        const tone = failed && active
          ? "bg-error text-white"
          : done
            ? "bg-secondary text-white"
            : active
              ? "bg-primary text-white animate-pulse"
              : "bg-surface-container-high text-outline";
        return (
          <li key={step.stage} className="flex items-center" aria-current={active ? "step" : undefined}>
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tone}`}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  {done ? "check" : step.icon}
                </span>
              </span>
              <span className={`text-label-md ${done || active ? "text-on-surface font-semibold" : "text-outline"}`}>
                {step.label}
              </span>
            </div>
            {i < STAGE_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`hidden sm:block w-8 lg:w-14 h-0.5 mx-2 ${i < current || job.status === "DONE" ? "bg-secondary" : "bg-surface-container-high"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};
