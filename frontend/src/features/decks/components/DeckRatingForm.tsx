import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/formStyles";
import { extractErrorMessage } from "@/services/apiClient";
import { deleteMyRating, rateLibraryDeck } from "@/services/libraryService";
import type { LibraryRating } from "@/types/api.types";
import { RATING_COMMENT_MAX, commentCharsLeft, normalizeComment } from "@/lib/ratingUtils";
import { RatingStars } from "./RatingStars";

interface DeckRatingFormProps {
    deckId: string;
    initial: { stars: number; comment: string | null } | null;
    onChanged: (rating: LibraryRating) => void;
}

// Form đánh giá: 1-5 sao bắt buộc, bình luận tuỳ chọn (tối đa 500 ký tự). Mỗi người một đánh giá mỗi bộ thẻ: gửi lại = sửa.
export const DeckRatingForm: React.FC<DeckRatingFormProps> = ({ deckId, initial, onChanged }) => {
    const [stars, setStars] = useState(initial?.stars ?? 0);
    const [comment, setComment] = useState(initial?.comment ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const left = commentCharsLeft(comment);
    const canSubmit = stars >= 1 && left >= 0 && !busy;

    const run = async (action: () => Promise<LibraryRating>, after?: () => void) => {
        setBusy(true);
        setError(null);
        try {
            const result = await action();
            after?.();
            // V38: AI gắn cờ / chặn bình luận -> nói rõ cho người gửi (sao vẫn được lưu)
            const m = result.moderation;
            setNotice(m && (m.status === "BLOCKED" || m.status === "FLAGGED" || m.status === "PENDING") ? m.message : null);
            onChanged(result);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="flex flex-col gap-2 p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high"
            onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) run(() => rateLibraryDeck(deckId, stars, normalizeComment(comment)));
            }}
        >
            <p className="font-label-md text-label-md font-semibold text-on-surface">
                {initial ? "Đánh giá của bạn" : "Đánh giá bộ thẻ này"}
            </p>
            <RatingStars value={stars} onChange={setStars} disabled={busy} />
            <textarea
                aria-label="Bình luận (không bắt buộc)"
                className={`${fieldClass} min-h-20 resize-y`}
                placeholder="Chia sẻ cảm nhận của bạn (không bắt buộc)"
                value={comment}
                disabled={busy}
                onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
                <span className={`text-label-sm ${left < 0 ? "text-error" : "text-outline"}`}>
                    {comment.length}/{RATING_COMMENT_MAX}
                </span>
                <div className="flex items-center gap-2">
                    {initial && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            className="text-error hover:bg-error/10 hover:text-error cursor-pointer"
                            onClick={() =>
                                run(() => deleteMyRating(deckId), () => {
                                    setStars(0);
                                    setComment("");
                                })
                            }
                        >
                            Xoá đánh giá
                        </Button>
                    )}
                    <Button type="submit" size="sm" isLoading={busy} disabled={!canSubmit} className="cursor-pointer">
                        {initial ? "Cập nhật" : "Gửi đánh giá"}
                    </Button>
                </div>
            </div>
            {error && (
                <p role="alert" className="text-xs text-error">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="text-xs text-[#B45309]">
                    {notice}
                </p>
            )}
        </form>
    );
};
