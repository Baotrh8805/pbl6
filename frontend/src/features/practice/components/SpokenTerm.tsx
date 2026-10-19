import React, { useEffect, useState } from "react";
import { Ruby } from "@/lib/ja";
import { canSpeak, speak, speakJa, stopSpeaking } from "@/lib/speech";
import type { ReadingSegment } from "@/types/api.types";

interface SpokenTermProps {
    term: string;
    reading?: string | null;
    segments?: ReadingSegment[] | null;
    /**
     * E5 – chế độ chỉ nghe: tự đọc khi hiện, ẩn chữ sau nút "Hiện chữ". Nơi dùng nên `key` theo thẻ / câu hỏi để
     * trạng thái ẩn/hiện reset khi sang câu khác.
     */
    audioOnly?: boolean;
    /** Lớp cho phần chữ (cỡ, đậm); nút loa giữ cỡ cố định. */
    className?: string;
}

const iconButton =
    "p-2 rounded-full text-on-surface-variant hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Trình duyệt chỉ cho phát âm khi trang đã nhận ít nhất một cử chỉ của người dùng (autoplay policy). Quiz khôi phục từ
// ?attempt= lúc tải lại trang / mở link ở tab mới chưa có cú bấm nào -> tự đọc bị chặn ("not-allowed"). Trình duyệt không
// có navigator.userActivation thì cứ thử đọc; lỗi thì cũng rơi về nút "Bấm để nghe" bên dưới.
const hasUserActivation = (): boolean => navigator.userActivation?.hasBeenActive ?? true;

// Thuật ngữ + nút loa, dùng ở câu hỏi Quiz (và nơi nào cần "từ + loa" gọn). Chế độ chỉ nghe: tự đọc khi mount /
// đổi từ, unmount thì dừng đọc để sang câu khác không còn tiếng câu cũ. Chưa được phép tự phát âm (chưa có cử chỉ) hoặc
// đọc lỗi -> hiện nút "Bấm để nghe" thay vì để người dùng nhìn tai nghe trong im lặng (giống cổng "Bắt đầu nghe" ở trang học).
export const SpokenTerm: React.FC<SpokenTermProps> = ({ term, reading, segments, audioOnly = false, className = "" }) => {
    const [shown, setShown] = useState(!audioOnly);
    const [needsTap, setNeedsTap] = useState(false);
    const hidden = audioOnly && !shown;

    useEffect(() => {
        if (!audioOnly || !canSpeak) return;
        let alive = true;
        const attempt = hasUserActivation() ? speakJa(term) : Promise.reject(new Error("not-allowed"));
        attempt.catch(() => {
            if (alive) setNeedsTap(true);
        });
        return () => {
            alive = false;
            stopSpeaking();
        };
    }, [audioOnly, term]);

    return (
        <span className="inline-flex flex-wrap items-center justify-center gap-2">
            {hidden ? (
                <span className="inline-flex flex-col items-center gap-1 text-on-surface-variant">
                    <span aria-hidden="true" className="material-symbols-outlined text-[40px]">
                        headphones
                    </span>
                    <span className="sr-only">Chữ đang ẩn (chế độ chỉ nghe)</span>
                    {/* Nút giữ nguyên tới hết câu (không ẩn sau khi bấm để focus bàn phím không rơi về <body>); speak() chạy
                        ngay trong cú bấm — chính là cử chỉ trình duyệt cần, các câu sau (component mới theo key) tự đọc được. */}
                    {needsTap && (
                        <>
                            <button
                                type="button"
                                onClick={() => speak(term)}
                                className="inline-flex items-center gap-1 px-4 py-2 min-h-11 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                    volume_up
                                </span>
                                Bấm để nghe
                            </button>
                            <span role="status" className="text-label-sm font-normal max-w-xs">
                                Chưa tự phát âm được — trình duyệt cần một cú bấm trước.
                            </span>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={() => setShown(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-11 rounded-lg bg-surface-container-high font-label-md text-label-md font-semibold text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            visibility
                        </span>
                        Hiện chữ
                    </button>
                </span>
            ) : (
                <span className={className}>
                    <Ruby term={term} reading={reading ?? undefined} segments={segments} />
                </span>
            )}
            {canSpeak && (
                <button
                    type="button"
                    onClick={() => speak(term)}
                    aria-label={`Phát âm ${term}`}
                    title="Nghe phát âm"
                    className={iconButton}
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[22px]">
                        volume_up
                    </span>
                </button>
            )}
        </span>
    );
};
