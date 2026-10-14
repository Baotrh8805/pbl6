import React from "react";

interface ProgressBarProps {
  pct: number;
  label: string;
  tone?: "primary" | "secondary";
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ pct, label, tone = "secondary", className = "" }) => {
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div
      className={`w-full h-2 bg-surface-container rounded-full overflow-hidden ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-secondary"} transition-all duration-300`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
};
