import React from "react";
import type { ExtractionItem } from "@/types/api.types";
import { levelTooltip } from "../extractionUtils";

const LEVEL_TONE: Record<string, string> = {
  N5: "bg-secondary-container/50 text-on-secondary-container",
  N4: "bg-primary-fixed text-on-primary-fixed",
  N3: "bg-[#FEF3C7] text-[#B45309]",
  N2: "bg-tertiary-fixed text-on-tertiary-fixed",
  N1: "bg-error-container text-on-error-container",
};

export const LevelBadge: React.FC<{ item: ExtractionItem }> = ({ item }) => (
  <span
    title={levelTooltip(item)}
    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-label-sm text-[11px] font-bold cursor-help ${
      item.level ? LEVEL_TONE[item.level] : "bg-surface-container text-outline"
    }`}
  >
    {item.level ?? "?"}
    {item.level && item.levelConfidence < 1 && (
      <span aria-hidden="true" className="material-symbols-outlined text-[12px]">help</span>
    )}
  </span>
);
