import React from "react";
import type { ExtractionItem } from "@/types/api.types";
import { LEVEL_TONE, UNKNOWN_LEVEL_TONE, levelTooltip } from "../extractionUtils";

export const LevelBadge: React.FC<{ item: ExtractionItem }> = ({ item }) => (
  <span
    title={levelTooltip(item)}
    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-label-sm text-[11px] font-bold cursor-help ${
      item.level ? LEVEL_TONE[item.level] : UNKNOWN_LEVEL_TONE
    }`}
  >
    {item.level ?? "?"}
    {item.level && item.levelConfidence < 1 && (
      <span aria-hidden="true" className="material-symbols-outlined text-[12px]">help</span>
    )}
  </span>
);
