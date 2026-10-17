import React from "react";

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  tone?: "default" | "warn";
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, sub, tone = "default" }) => (
  <div
    className={`rounded-2xl border p-space-md bg-surface-container-lowest ${
      tone === "warn" ? "border-error/30" : "border-surface-container-high"
    }`}
  >
    <div className="text-label-sm uppercase tracking-wider text-outline font-bold">{label}</div>
    <div className={`mt-1 font-headline-sm text-headline-sm font-bold ${tone === "warn" ? "text-error" : "text-on-surface"}`}>
      {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
    </div>
    {sub && <div className="mt-1 text-body-sm text-on-surface-variant">{sub}</div>}
  </div>
);
