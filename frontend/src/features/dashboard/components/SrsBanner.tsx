import React from "react";
import { useOutletContext } from "react-router-dom";
import type { ShellContext } from "@/components/layout/shellContext";

interface SrsBannerProps {
  /** Tổng thẻ cần học hôm nay (đến hạn + mới) — chỉ dùng khi không có số tách riêng. */
  srsDueCount: number;
  /** A5: thẻ đã học đến hạn hôm nay. Bỏ trống -> lấy từ số liệu AppLayout (metrics.dueToday). */
  dueToday?: number;
  /** A5: thẻ mới chưa học lần nào. Bỏ trống -> metrics.newCards. */
  newCards?: number;
  currentLevel: string;
  onDismiss: () => void;
  onStartSrs: () => void;
}

// Banner "hôm nay cần học gì": nâng cấp dải màu Gradient Blue/Indigo dịu mắt + nút CTA cam WCAG AAA.
export const SrsBanner: React.FC<SrsBannerProps> = ({
  srsDueCount,
  dueToday,
  newCards,
  currentLevel,
  onDismiss,
  onStartSrs,
}) => {
  const shell = useOutletContext<ShellContext | undefined>();
  const due = dueToday ?? shell?.metrics.dueToday ?? srsDueCount;
  const fresh = newCards ?? shell?.metrics.newCards ?? 0;
  const dueDecks = shell?.metrics.dueDecks ?? 0;
  const hasWork = due > 0 || fresh > 0;
  const buttonLabel = due > 0 ? "Ôn tập ngay" : fresh > 0 ? "Học thẻ mới" : "Học thêm từ mới";
  const buttonCount = due > 0 ? due : fresh;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-5 md:p-6 shadow-md text-white transition-all duration-300">
      <div className="absolute -right-8 -bottom-10 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute left-1/3 top-0 w-36 h-36 rounded-full bg-white/5 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-[999_1_20rem] min-w-0 items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner text-amber-300">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px] animate-pulse">
              notifications_active
            </span>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-label-sm text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold backdrop-blur-sm whitespace-nowrap">
                SRS Real-time Due
              </span>
              <span className="text-xs text-blue-100 font-mono whitespace-nowrap">
                Cập nhật {new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {hasWork ? (
              <>
                <p className="font-headline text-lg sm:text-xl font-bold text-white leading-snug">
                  Hôm nay:{" "}
                  <span className="text-amber-300 font-extrabold underline decoration-amber-300/40 underline-offset-4">
                    {due} thẻ đến hạn{dueDecks > 0 ? ` trong ${dueDecks} bộ thẻ` : ""}
                  </span>{" "}
                  · <span className="font-bold text-white">{fresh} thẻ mới</span>
                </p>
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed max-w-xl">
                  {due > 0
                    ? `Ôn thẻ đến hạn trước để giữ chuỗi nhớ ngắt quãng (Spaced Repetition), rồi học thẻ mới ${currentLevel}.`
                    : `Không còn thẻ nào cần ôn — học thêm thẻ mới để mở rộng vốn từ ${currentLevel}.`}
                </p>
              </>
            ) : (
              <>
                <p className="font-headline text-lg sm:text-xl font-bold text-white leading-snug">
                  Tuyệt vời! Bạn không có thẻ nào cần ôn tập hôm nay.
                </p>
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed max-w-xl">
                  Hãy nạp thêm tài liệu mới hoặc luyện thi Quiz để mở rộng kho từ vựng {currentLevel}.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex grow items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onStartSrs}
            className="flex-1 flex items-center justify-center gap-2 min-h-11 px-4 sm:px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-label-md text-sm shadow-md hover:shadow-lg active:scale-95 transition-all group font-bold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="hidden sm:inline-flex">
              <span className="material-symbols-outlined text-slate-950 group-hover:rotate-12 transition-transform">
                history_edu
              </span>
            </span>
            <span>{buttonLabel}</span>
            {buttonCount > 0 && (
              <span className="font-label-sm text-xs bg-slate-950/15 text-slate-950 px-2 py-0.5 rounded-md font-extrabold">
                {buttonCount} thẻ
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Ẩn tạm thời"
            aria-label="Đóng banner"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>
    </section>
  );
};
