import React from "react";

interface SrsBannerProps {
  srsDueCount: number;
  currentLevel: string;
  onDismiss: () => void;
  onStartSrs: () => void;
}

export const SrsBanner: React.FC<SrsBannerProps> = ({
  srsDueCount,
  currentLevel,
  onDismiss,
  onStartSrs,
}) => {
  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-r from-tertiary via-tertiary-container to-primary p-space-md shadow-md text-on-tertiary transition-all duration-300">
      <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-on-tertiary-container/10 blur-2xl pointer-events-none" />
      <div className="absolute left-1/3 top-0 w-32 h-32 rounded-full bg-secondary-container/10 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-surface-container-lowest/15 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner">
            <span className="material-symbols-outlined text-secondary-fixed text-[28px] animate-pulse">
              notifications_active
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-lowest/20 text-tertiary-fixed-dim font-bold">
                SRS Real-time Due
              </span>
              <span className="text-xs text-on-tertiary/70 font-mono">
                Cập nhật {new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {srsDueCount > 0 ? (
              <>
                <p className="font-headline-sm text-headline-sm text-on-tertiary leading-snug">
                  Bạn có{" "}
                  <span className="text-secondary-fixed font-bold underline decoration-secondary-fixed/40 underline-offset-4">
                    {srsDueCount} thẻ
                  </span>{" "}
                  từ vựng &amp; ngữ pháp {currentLevel} đã đến hạn ôn tập hôm nay!
                </p>
                <p className="font-body-sm text-body-sm text-on-tertiary/80">
                  Duy trì chuỗi nhớ ngắt quãng (Spaced Repetition) để ghi nhớ lâu dài kiến thức {currentLevel}.
                </p>
              </>
            ) : (
              <>
                <p className="font-headline-sm text-headline-sm text-on-tertiary leading-snug">
                  Tuyệt vời! Bạn không có thẻ nào cần ôn tập hôm nay.
                </p>
                <p className="font-body-sm text-body-sm text-on-tertiary/80">
                  Hãy nạp thêm tài liệu mới hoặc luyện thi Quiz để mở rộng kho từ vựng {currentLevel}.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-space-sm w-full md:w-auto shrink-0 pt-2 md:pt-0">
          <button
            onClick={onStartSrs}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-space-lg py-2.5 rounded-lg bg-surface-container-lowest text-tertiary font-label-md text-label-md hover:bg-surface-bright transition-all shadow-md active:scale-95 group font-bold cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-tertiary-container group-hover:rotate-12 transition-transform">
              history_edu
            </span>
            <span>{srsDueCount > 0 ? "Ôn tập ngay (SRS Mode)" : "Học thêm từ mới"}</span>
            <span className="font-label-sm text-label-sm bg-tertiary-fixed text-on-tertiary-fixed px-1.5 py-0.5 rounded font-bold">
              {srsDueCount} thẻ
            </span>
          </button>

          <button
            onClick={onDismiss}
            className="p-2 rounded-lg bg-surface-container-lowest/10 hover:bg-surface-container-lowest/20 text-on-tertiary transition-colors cursor-pointer"
            title="Ẩn tạm thời"
            aria-label="Đóng banner"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>
    </section>
  );
};
