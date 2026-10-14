import React from "react";
import type { ReadingSegment } from "@/types/api.types";

// <ruby> native: screen reader đọc đúng, không cần thư viện furigana.
// Có `segments` (backend đã căn kanji <-> kana từng đoạn): mỗi đoạn một <ruby>, đoạn không có kanji
// (kana === kanji) in thường. Không có: furigana gắn cho cả từ như trước.
export const Ruby: React.FC<{
    term: string;
    reading?: string;
    segments?: ReadingSegment[] | null;
    className?: string;
}> = ({ term, reading, segments, className }) => {
    if (segments && segments.length > 0) {
        return (
            <span lang="ja" className={className}>
                {segments.map((seg, i) =>
                    seg.kana && seg.kana !== seg.kanji ? (
                        <ruby key={i}>
                            {seg.kanji}
                            <rp>(</rp>
                            <rt>{seg.kana}</rt>
                            <rp>)</rp>
                        </ruby>
                    ) : (
                        <React.Fragment key={i}>{seg.kanji}</React.Fragment>
                    )
                )}
            </span>
        );
    }
    return (
        <ruby lang="ja" className={className}>
            {term}
            {reading ? (
                <>
                    <rp>(</rp>
                    <rt>{reading}</rt>
                    <rp>)</rp>
                </>
            ) : null}
        </ruby>
    );
};
