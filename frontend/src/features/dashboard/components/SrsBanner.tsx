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

// Banner "hôm nay cần học gì": tách thẻ ĐẾN HẠN (ôn để không quên) với thẻ MỚI (chưa học lần nào) vì đó là hai việc khác
// nhau — trước đây gộp chung thành "N thẻ đến hạn" khiến bộ thẻ mới tạo trông như nợ ôn. Số tách lấy từ props, không có
// thì từ ngữ cảnh AppLayout (banner luôn nằm trong layout), để trang gọi chưa cần đổi.
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
  const hasWork = due > 0 || fresh > 0;
  const buttonLabel = due > 0 ? "Ôn tập ngay" : fresh > 0 ? "Học thẻ mới" : "Học thêm từ mới";
  const buttonCount = due > 0 ? due : fresh;

  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-r from-tertiary via-tertiary-container to-primary p-space-md shadow-md text-on-tertiary transition-all duration-300">
      <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-on-tertiary-container/10 blur-2xl pointer-events-none" />
      <div className="absolute left-1/3 top-0 w-32 h-32 rounded-full bg-secondary-container/10 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-surface-container-lowest/15 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner">
            <span aria-hidden="true" className="material-symbols-outlined text-secondary-fixed text-[28px] animate-pulse">
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

            {hasWork ? (
              <>
                <p className="font-headline-sm text-headline-sm text-on-tertiary leading-snug">
                  Hôm nay:{" "}
                  <span className="text-secondary-fixed font-bold underline decoration-secondary-fixed/40 underline-offset-4">
                    {due} thẻ đến hạn
                  </span>{" "}
                  · <span className="font-bold">{fresh} thẻ mới</span>
                </p>
                <p className="font-body-sm text-body-sm text-on-tertiary/80">
                  {due > 0
                    ? `Ôn thẻ đến hạn trước để giữ chuỗi nhớ ngắt quãng (Spaced Repetition), rồi học thẻ mới ${currentLevel}.`
                    : `Không còn thẻ nào cần ôn — học thêm thẻ mới để mở rộng vốn từ ${currentLevel}.`}
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
            type="button"
            onClick={onStartSrs}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-space-lg py-2.5 rounded-lg bg-surface-container-lowest text-tertiary font-label-md text-label-md hover:bg-surface-bright transition-all shadow-md active:scale-95 group font-bold cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-tertiary-container group-hover:rotate-12 transition-transform">
              history_edu
            </span>
            <span>{buttonLabel}</span>
            {buttonCount > 0 && (
              <span className="font-label-sm text-label-sm bg-tertiary-fixed text-on-tertiary-fixed px-1.5 py-0.5 rounded font-bold">
                {buttonCount} thẻ
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="p-2 rounded-lg bg-surface-container-lowest/10 hover:bg-surface-container-lowest/20 text-on-tertiary transition-colors cursor-pointer"
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
