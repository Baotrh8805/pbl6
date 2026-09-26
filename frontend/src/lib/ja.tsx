import React from "react";

// <ruby> native: screen reader đọc đúng, không cần thư viện furigana.
// ponytail: furigana gắn cho cả từ, chưa tách theo từng kanji.
// Nâng cấp khi backend trả mảng {kanji, kana} cho từng đoạn: map thành nhiều <ruby>.
export const Ruby: React.FC<{ term: string; reading?: string; className?: string }> = ({
    term,
    reading,
    className,
}) => (
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
