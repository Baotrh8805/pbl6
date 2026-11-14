// Mẹo nhớ chữ Hán phía người học (C4, hợp đồng đợt 2 §4). Mẹo do AI gợi ý hay tự viết đều vào hàng chờ PENDING; chỉ
// mẹo quản trị viên duyệt mới hiện cho mọi người. Response đi qua parse* (features/kanji/mnemonicUtils) vì là dữ liệu
// không đáng tin.
import { apiClient } from "./apiClient.ts";
import { parseRadicalCards } from "../lib/kanjiUtils.ts";
import {
    parseGenerateResult,
    parseKanjiMnemonics,
    parseMyMnemonic,
    parseRadicalMnemonicSources,
} from "../features/kanji/mnemonicUtils.ts";
import type { RadicalCardsResponse } from "../types/api.types.ts";
import type {
    GenerateMnemonicsResult,
    KanjiMnemonics,
    MyMnemonic,
    RadicalMnemonicSource,
} from "../types/learner.types.ts";

/** GET /kanji/{ch}/mnemonics -> mẹo đã duyệt (hoặc null) + các mẹo mình đã gửi. */
export const fetchKanjiMnemonics = async (kanji: string): Promise<KanjiMnemonics> =>
    parseKanjiMnemonics((await apiClient.get(`/kanji/${encodeURIComponent(kanji)}/mnemonics`)).data, kanji);

/**
 * POST /kanji/mnemonics/generate {kanji ≤ 30}: AI viết mẹo, lưu PENDING chờ duyệt. Server bỏ qua chữ đã có mẹo PENDING
 * của chính mình (items rỗng); AI không chạy được thì mẹo là câu mẫu kèm `reason`. Gọi Gemini nên timeout dài.
 */
export const generateKanjiMnemonics = async (kanji: string[]): Promise<GenerateMnemonicsResult> =>
    parseGenerateResult((await apiClient.post("/kanji/mnemonics/generate", { kanji }, { timeout: 45_000 })).data);

/** POST /kanji/mnemonics {kanji, mnemonicVi ≤ 300}: 201 mẹo USER PENDING; 409 khi đã có 3 mẹo chờ duyệt cho chữ này. */
export const submitKanjiMnemonic = async (kanji: string, mnemonicVi: string): Promise<MyMnemonic | null> =>
    parseMyMnemonic((await apiClient.post("/kanji/mnemonics", { kanji, mnemonicVi })).data);

export interface RadicalCardsWithSources {
    cards: RadicalCardsResponse;
    /** Nguồn mẹo từng chữ, gồm cả "approved" (mẹo đã duyệt) mà RadicalCardsResponse không giữ. */
    sources: Record<string, RadicalMnemonicSource>;
}

/**
 * POST /nlp/radicals/cards {kanji (≤ 30 từ UI)}: thẻ bộ thủ + nhóm theo bộ, kèm nguồn mẹo: server đợt 2 trả mẹo APPROVED
 * (`mnemonicSource: "approved"`) nếu có, không thì câu mẫu. Không gọi Gemini ở đây (withMnemonic=false): mẹo AI mới
 * phải qua kiểm duyệt, người học xin ở thẻ chữ Hán ("Nhờ AI gợi ý").
 */
export const fetchRadicalCardsWithSources = async (kanji: string[]): Promise<RadicalCardsWithSources> => {
    const raw: unknown = (await apiClient.post("/nlp/radicals/cards", { kanji, withMnemonic: false }, { timeout: 30_000 })).data;
    return { cards: parseRadicalCards(raw), sources: parseRadicalMnemonicSources(raw) };
};
