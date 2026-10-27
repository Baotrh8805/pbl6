import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchDeckRatings } from "@/services/libraryService";
import type { DeckRatingItem, LibraryRating } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { getInitials } from "@/lib/textUtils";
import { formatRatingAverage, ratingFormKey } from "@/lib/ratingUtils";
import { DeckRatingForm } from "./DeckRatingForm";
import { RatingStars } from "./RatingStars";

interface DeckRatingsProps {
    deckId: string;
    isOwner: boolean; // chủ bộ thẻ xem được nhưng không tự chấm
    onChanged?: (rating: LibraryRating) => void;
}

// Tổng hợp (trung bình, số lượt) + form đánh giá + danh sách đánh giá kèm bình luận. Chỉ dùng cho bộ thẻ public.
export const DeckRatings: React.FC<DeckRatingsProps> = ({ deckId, isOwner, onChanged }) => {
    const [reload, setReload] = useState(0);
    const { data, error, loading } = useAsync(() => fetchDeckRatings(deckId, 0), [deckId], reload);

    // Các trang sau trang đầu, tải khi bấm "Xem thêm"; trang đầu tải lại (reload) thì bỏ phần này.
    const [more, setMore] = useState<{ reload: number; items: DeckRatingItem[]; page: number }>({
        reload: 0,
        items: [],
        page: 0,
    });
    const [moreBusy, setMoreBusy] = useState(false);
    const [moreError, setMoreError] = useState<string | null>(null);
    const extra = more.reload === reload ? more : { reload, items: [], page: 0 };

    if (loading) return <p className="text-on-surface-variant">Đang tải đánh giá...</p>;
    if (error || !data) return <p className="text-error">{error}</p>;

    const items = [...data.items, ...extra.items];
    const loadMore = async () => {
        setMoreBusy(true);
        setMoreError(null);
        try {
            const next = await fetchDeckRatings(deckId, extra.page + 1);
            setMore({ reload, items: [...extra.items, ...next.items], page: extra.page + 1 });
        } catch (err) {
            setMoreError(extractErrorMessage(err));
        } finally {
            setMoreBusy(false);
        }
    };

    return (
        <section aria-labelledby="deck-ratings-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <h2 id="deck-ratings-title" className="font-title-md text-title-md font-bold text-on-surface">
                    Đánh giá
                </h2>
                <span className="inline-flex items-center gap-2 text-body-md text-on-surface">
                    <RatingStars value={Math.round(data.rating ?? 0)} sizeClass="text-[18px]" />
                    <strong>{formatRatingAverage(data.rating)}</strong>
                    <span className="text-on-surface-variant">({data.ratingsCount} lượt)</span>
                </span>
            </div>

            {isOwner ? (
                <p className="text-body-sm text-on-surface-variant">Đây là bộ thẻ bạn đã đăng nên không thể tự đánh giá.</p>
            ) : (
                <DeckRatingForm
                    key={ratingFormKey(data.mine)}
                    deckId={deckId}
                    initial={data.mine}
                    onChanged={(r) => {
                        setReload((n) => n + 1);
                        onChanged?.(r);
                    }}
                />
            )}

            {items.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">Chưa có đánh giá nào.</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {items.map((r, i) => (
                        <li
                            key={`${r.displayName}-${r.updatedAt}-${i}`}
                            className="flex gap-3 p-space-sm sm:p-space-md rounded-xl bg-surface-container-lowest border border-surface-container-high"
                        >
                            <span
                                aria-hidden="true"
                                className="shrink-0 w-9 h-9 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-label-md font-semibold"
                            >
                                {getInitials(r.displayName)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2">
                                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                                        {r.displayName}
                                        {r.mine && " (bạn)"}
                                    </span>
                                    <RatingStars value={r.stars} sizeClass="text-[16px]" />
                                    <time dateTime={r.updatedAt} className="text-label-sm text-outline">
                                        {new Date(r.updatedAt).toLocaleDateString("vi-VN")}
                                    </time>
                                </div>
                                {r.comment && (
                                    <p className="mt-1 text-body-sm text-on-surface-variant whitespace-pre-wrap break-words">
                                        {r.comment}
                                    </p>
                                )}
                                {r.moderation?.masked && (
                                    <p className="text-label-sm text-outline">Một vài từ đang được che chờ quản trị viên xem lại.</p>
                                )}
                                {r.mine && r.moderation && !r.moderation.masked && r.moderation.message && (
                                    <p className={`text-label-sm ${r.moderation.status === "BLOCKED" ? "text-error" : "text-[#B45309]"}`}>
                                        {r.moderation.message}
                                    </p>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {items.length < data.ratingsCount && (
                <Button variant="outline" size="sm" isLoading={moreBusy} onClick={loadMore} className="self-start cursor-pointer">
                    Xem thêm
                </Button>
            )}
            {moreError && (
                <p role="alert" className="text-xs text-error">
                    {moreError}
                </p>
            )}
        </section>
    );
};
