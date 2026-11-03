import React from "react";

export type Status = { type: "success" | "error"; text: string } | null;

// Vùng aria-live luôn render (kể cả khi rỗng) để trình đọc màn hình bắt được thay đổi.
export const StatusMessage: React.FC<{ status: Status }> = ({ status }) => (
    <p aria-live="polite" className="min-h-[1.25rem] text-xs">
        {status && (
            <span
                role={status.type === "error" ? "alert" : undefined}
                className={`inline-flex items-center gap-1.5 ${status.type === "error" ? "text-rose-600 font-semibold" : "text-emerald-700 font-semibold"}`}
            >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    {status.type === "error" ? "error" : "check_circle"}
                </span>
                {status.text}
            </span>
        )}
    </p>
);

export const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
    title,
    description,
    children,
}) => (
    <section className="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-6 flex flex-col gap-4">
        <div>
            <h2 className="font-bold text-slate-900 text-lg tracking-tight">{title}</h2>
            {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
        </div>
        {children}
    </section>
);
