import React from "react";

export type Status = { type: "success" | "error"; text: string } | null;

// Vùng aria-live luôn render (kể cả khi rỗng) để trình đọc màn hình bắt được thay đổi.
export const StatusMessage: React.FC<{ status: Status }> = ({ status }) => (
    <p aria-live="polite" className="min-h-[1.25rem] text-body-sm">
        {status && (
            <span
                role={status.type === "error" ? "alert" : undefined}
                className={`inline-flex items-center gap-1 ${status.type === "error" ? "text-error" : "text-secondary"}`}
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
    <section className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-space-lg flex flex-col gap-space-md">
        <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
            {description && <p className="text-body-sm text-on-surface-variant mt-0.5">{description}</p>}
        </div>
        {children}
    </section>
);
