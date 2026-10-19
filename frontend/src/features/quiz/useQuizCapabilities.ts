import { useState } from "react";
import { useAsync } from "@/lib/useAsync";
import { canEditDeck } from "@/lib/deckUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchDeck } from "@/services/deckService";
import { fetchQuizCapabilities } from "@/services/studyService";
import type { QuizCapabilities } from "@/types/quiz.types";
import { isEndpointMissing } from "@/lib/apiErrorInfo";

/**
 * idle: chưa hỏi (không ở màn bắt đầu) · ok: có số liệu · unavailable: server chưa có endpoint (404 chung / 405) hoặc response
 * hỏng -> chỉ loại nghĩa như trước · error: lỗi khác (mạng...) -> cho thử lại, vẫn làm được câu nghĩa.
 */
export type CapabilitiesStatus = "idle" | "ok" | "unavailable" | "error";

export interface QuizCapabilitiesState {
    status: CapabilitiesStatus;
    /** Chỉ khác null khi status = ok. */
    caps: QuizCapabilities | null;
    /** Lần tải đầu đang chạy (tải lại sau khi sinh câu nhiễu thì giữ số cũ, không nháy). */
    loading: boolean;
    error: string | null;
    /** Chủ bộ thẻ / người được chia sẻ quyền sửa: được bấm "Sinh câu nhiễu". */
    canGenerate: boolean;
    /** Số thẻ của bộ (mỗi thẻ ra tối đa một câu); chưa tải / lỗi -> null. */
    cardCount: number | null;
    reload: () => void;
}

type CapsResult = { status: Exclude<CapabilitiesStatus, "idle">; caps: QuizCapabilities | null; error: string | null };

/**
 * Khả năng tạo câu hỏi theo loại của một bộ thẻ (GET /decks/{id}/quiz-capabilities) + quyền sinh câu nhiễu.
 * `enabled = false` (đang làm bài / xem lại) thì không gọi gì: màn bắt đầu mới cần các số này.
 */
export function useQuizCapabilities(deckId: string, enabled: boolean): QuizCapabilitiesState {
    const [version, setVersion] = useState(0);

    const capsQuery = useAsync<CapsResult | null>(
        async () => {
            if (!enabled || !deckId) return null;
            try {
                const caps = await fetchQuizCapabilities(deckId);
                return caps ? { status: "ok", caps, error: null } : { status: "unavailable", caps: null, error: null };
            } catch (e) {
                // Backend đợt 2 làm song song: endpoint chưa có thì im lặng lùi về câu nghĩa, không báo lỗi đỏ.
                if (isEndpointMissing(e)) return { status: "unavailable", caps: null, error: null };
                return { status: "error", caps: null, error: extractErrorMessage(e) };
            }
        },
        [deckId, enabled],
        version
    );

    // Quyền + số thẻ của bộ chỉ cần một lần cho màn bắt đầu; lỗi -> coi như không được sửa (backend vẫn chặn 403) và
    // không biết số thẻ (không hiện cảnh báo số câu).
    const deckQuery = useAsync(
        async () => {
            if (!enabled || !deckId) return null;
            const deck = await fetchDeck(deckId);
            return { canEdit: canEditDeck(deck), cardCount: deck.cards.length };
        },
        [deckId, enabled]
    );

    const result = capsQuery.data ?? null;
    return {
        status: result?.status ?? "idle",
        caps: result?.status === "ok" ? result.caps : null,
        loading: enabled && capsQuery.loading,
        error: result?.error ?? null,
        canGenerate: deckQuery.data?.canEdit === true,
        cardCount: deckQuery.data?.cardCount ?? null,
        reload: () => setVersion((v) => v + 1),
    };
}
