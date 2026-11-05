import React from "react";
import type { ReadingSegment } from "@/types/api.types";
import {
    type FuriganaStyle,
    isPosTag,
    splitTermPos,
    autoAlignFurigana,
} from "./jaUtils";

// <ruby> native: screen reader đọc đúng, không cần thư viện furigana ngoài.
export const Ruby: React.FC<{
    term: string;
    reading?: string;
    segments?: ReadingSegment[] | null;
    className?: string;
    /** Kiểu hiển thị: "ruby" (trên đầu chữ) hoặc "stacked" (2 tầng như Mazii) */
    style?: FuriganaStyle;
}> = ({ term, reading, segments, className, style = "ruby" }) => {
    const { cleanTerm, tag } = splitTermPos(term);

    // Kiểu 2: "stacked" (cùng định nghĩa) - Giữ Kanji nguyên bản thoáng mắt ở trung tâm, không chèn chữ lên đầu
    if (style === "stacked") {
        return (
            <div lang="ja" className={`text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-snug font-japanese inline-flex items-center justify-center flex-wrap gap-1.5 ${className ?? ""}`}>
                <span>{cleanTerm}</span>
                {tag && (
                    <span className="text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle tracking-normal">
                        {tag}
                    </span>
                )}
            </div>
        );
    }

    // Kiểu 1: Trên đầu chữ (Ruby Style)
    // Tự động căn chỉnh nếu chưa có readingSegments từ backend
    const effectiveSegments =
        segments && segments.length > 0
            ? segments
            : reading
            ? autoAlignFurigana(term, reading)
            : null;

    if (effectiveSegments && effectiveSegments.length > 0) {
        return (
            <span lang="ja" className={className}>
                {effectiveSegments.map((seg, i) => {
                    if (isPosTag(seg.kanji)) {
                        return (
                            <span
                                key={i}
                                className="inline-block text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle ml-2 tracking-normal"
                            >
                                {seg.kanji.trim()}
                            </span>
                        );
                    }
                    return seg.kana && seg.kana !== seg.kanji ? (
                        <ruby key={i}>
                            {seg.kanji}
                            <rp>(</rp>
                            <rt className="font-japanese font-normal select-none">{seg.kana}</rt>
                            <rp>)</rp>
                        </ruby>
                    ) : (
                        <React.Fragment key={i}>{seg.kanji}</React.Fragment>
                    );
                })}
            </span>
        );
    }

    return (
        <ruby lang="ja" className={className}>
            {cleanTerm}
            {reading ? (
                <>
                    <rp>(</rp>
                    <rt className="font-japanese font-normal select-none">{reading}</rt>
                    <rp>)</rp>
                </>
            ) : null}
            {tag && (
                <span className="inline-block text-xs md:text-sm font-sans font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full align-middle ml-2 tracking-normal">
                    {tag}
                </span>
            )}
        </ruby>
    );
};
