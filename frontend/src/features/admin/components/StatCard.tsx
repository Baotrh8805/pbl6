import React from "react";
import { useCountUp } from "../useCountUp.ts";

export interface StatCardProps {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  tone?: "default" | "success" | "warn";
  icon?: string;
  delta?: { value: number; label?: string } | null;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  tone = "default",
  icon,
  delta,
}) => {
  const isNumeric = typeof value === "number";
  const animatedValue = useCountUp(isNumeric ? value : 0);
  const displayValue = isNumeric ? animatedValue.toLocaleString("vi-VN") : value;

  const toneBorder =
    tone === "warn"
      ? "border-error/40 ring-1 ring-error/20"
      : tone === "success"
        ? "border-secondary/40"
        : "border-surface-container-high";

  const toneValueColor =
    tone === "warn"
      ? "text-error"
      : tone === "success"
        ? "text-secondary"
        : "text-on-surface";

  return (
    <div
      className={`rounded-2xl border p-space-md bg-surface-container-lowest shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${toneBorder}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-label-sm uppercase tracking-wider text-outline font-bold truncate">
            {label}
          </div>
          {icon && (
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[20px] text-outline shrink-0"
            >
              {icon}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <div className={`font-headline-sm text-headline-sm font-bold tracking-tight ${toneValueColor}`}>
            {displayValue}
          </div>

          {delta && delta.value !== 0 && (
            <span
              className={`text-label-sm font-semibold px-1.5 py-0.5 rounded-md ${
                delta.value > 0
                  ? "bg-secondary-container/30 text-secondary"
                  : "bg-error/10 text-error"
              }`}
              title={delta.label || `Biến động: ${delta.value > 0 ? "+" : ""}${delta.value}%`}
            >
              {delta.value > 0 ? `+${delta.value}%` : `${delta.value}%`}
            </span>
          )}
        </div>
      </div>

      {sub && <div className="mt-2 text-body-sm text-on-surface-variant truncate">{sub}</div>}
    </div>
  );
};
