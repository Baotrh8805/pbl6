import { dayKey } from "../../lib/learningStats.ts";
import { calcDeckProgress, type DeckProgress } from "../../lib/deckUtils.ts";
import { MAX_REACTION_MS, isDue, type Review } from "../../lib/srs.ts";
import type {
    Card,
    Deck,
    LearningPath,
    LearningPathChapter,
    LearningPathChapterState,
    LearningPathCompletion,
    LearningPathForecastDay,
    LearningPathJob,
    LearningPathPatch,
    LearningPathStatus,
    LearningPathTask,
    LearningPathTodayState,
    SessionCard,
    SessionCardMode,
    SessionCounts,
    SessionKind,
} from "../../types/api.types.ts";

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const DEFAULT_DAYS = 30;

export const PATH_STATUS_LABELS: Record<LearningPathStatus, string> = {
    PROCESSING: "Đang xử lý",
    DRAFT: "Bản nháp",
    ACTIVE: "Đang học",
    FAILED: "Thất bại",
};

export const isPathProcessing = (s: LearningPathStatus) => s === "PROCESSING";

export const isValidDays = (n: number) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;

/** "YYYY-MM-DD" -> 0h giờ địa phương (new Date("YYYY-MM-DD") là UTC nên lệch ngày ở múi giờ âm). */
export function parseDateOnly(s: string): Date {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function addDaysStr(s: string, n: number): string {
    const [y, m, d] = s.split("-").map(Number);
    return dayKey(new Date(y, m - 1, d + n));
}

/**
 * Ngày thứ mấy của lộ trình tại `today`, kẹp trong 1..totalDays. Có `mask` (2.0) thì chỉ đếm ngày học và ngày nghỉ trả
 * ngày học cuối trước đó — cùng kết quả với `today.dayIndex` server trả; không mặt nạ = cộng ngày lịch như 1.0.
 * Chỉ là dự phòng khi response thiếu `today` (bản 1.0): trang luôn ưu tiên số server.
 */
export function dayIndexFor(startDate: string | null, today: Date, totalDays: number, mask: string = ALL_WEEK): number {
    if (!startDate) return 1;
    const idx = dayIndexForMask(startDate, today, mask).index;
    return Math.min(Math.max(idx, 1), Math.max(totalDays, 1));
}

export const endDate = (startDate: string, totalDays: number): string => addDaysStr(startDate, totalDays - 1);

// ===== 2.0: ngày học / ngày nghỉ trong tuần (bản sao thuần của LearningPathScheduler.dateForDay / dayIndexFor) =====

/** Mặt nạ ngày học: 7 ký tự 0/1 theo thứ tự Thứ 2..Chủ nhật (cột `study_days`). */
export const ALL_WEEK = "1111111";
export const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

export const isValidStudyDays = (mask: string): boolean => /^[01]{7}$/.test(mask) && mask !== "0000000";

/** Mặt nạ hỏng (thiếu, sai ký tự, toàn 0) coi như học cả tuần: không bao giờ rơi vào vòng lặp không có ngày học. */
const normalizeMask = (mask: string): string => (isValidStudyDays(mask) ? mask : ALL_WEEK);

/** true khi `d` là ngày học theo mặt nạ (getDay: 0 = CN -> vị trí 6). */
export const isStudyDay = (d: Date, mask: string = ALL_WEEK): boolean =>
    normalizeMask(mask)[(d.getDay() + 6) % 7] === "1";

const addDaysDate = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Ngày học đầu tiên (ngày 1) = ngày đầu tiên được bật kể từ ngày bắt đầu (bắt đầu vào ngày nghỉ -> ngày học kế). */
const firstStudyDate = (startDate: string, mask: string): Date => {
    let cur = parseDateOnly(startDate);
    while (!isStudyDay(cur, mask)) cur = addDaysDate(cur, 1);
    return cur;
};

/** "YYYY-MM-DD" đọc được thành ngày; ô nhập ngày đang gõ dở ("") không được đưa vào vòng lặp đếm ngày học (treo). */
const isParsableDate = (s: string): boolean => !Number.isNaN(parseDateOnly(s).getTime());

/**
 * Ngày lịch của ngày học thứ `dayIndex` (1-based). Có mặt nạ thì chỉ đếm ngày được bật. Mặc định cả tuần nên nơi gọi
 * 1.0 không đổi (dayIndex ≤ 0 lùi về trước như cũ; với mặt nạ cũng lùi theo ngày học). Ngày bắt đầu hỏng -> cộng ngày
 * lịch như 1.0 (ra chuỗi NaN, không treo).
 */
export function dateForDay(startDate: string, dayIndex: number, mask: string = ALL_WEEK): string {
    const m = normalizeMask(mask);
    if (m === ALL_WEEK || !isParsableDate(startDate)) return addDaysStr(startDate, dayIndex - 1);
    let cur = firstStudyDate(startDate, m);
    const step = dayIndex >= 1 ? 1 : -1;
    for (let idx = 1; idx !== dayIndex; ) {
        cur = addDaysDate(cur, step);
        if (isStudyDay(cur, m)) idx += step;
    }
    return dayKey(cur);
}

export interface StudyDayIndex {
    /** Ngày học thứ mấy, chưa kẹp: ≤ 0 trước ngày học đầu tiên; ngày nghỉ -> ngày học cuối trước đó. */
    index: number;
    /** true khi `date` không phải ngày học theo mặt nạ. */
    rest: boolean;
}

/**
 * Ngược với dateForDay: `date` là ngày học thứ mấy (spec §3.5). Ngày nghỉ trả index của ngày học cuối trước đó kèm
 * rest = true. Trước ngày 1: 0, −1, … đếm lùi theo ngày học (cả tuần thì trùng dayIndexFor 1.0 chưa kẹp). Không trùng tên
 * với dayIndexFor 1.0 vì kiểu trả về khác (trang 1.0 vẫn dùng bản kẹp 1..totalDays).
 */
export function dayIndexForMask(startDate: string, date: Date | string, mask: string = ALL_WEEK): StudyDayIndex {
    const m = normalizeMask(mask);
    const target = typeof date === "string" ? parseDateOnly(date) : new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Ngày hỏng: NaN như phép trừ ngày 1.0 (nơi gọi kẹp / so sánh ra false), không đi vào vòng lặp.
    if (!isParsableDate(startDate) || Number.isNaN(target.getTime())) return { index: Number.NaN, rest: false };
    const targetKey = dayKey(target);
    const day1 = firstStudyDate(startDate, m);
    const day1Key = dayKey(day1);
    let index = 0;
    if (day1Key <= targetKey) {
        for (let cur = day1; dayKey(cur) <= targetKey; cur = addDaysDate(cur, 1)) if (isStudyDay(cur, m)) index++;
    } else {
        for (let cur = addDaysDate(target, 1); dayKey(cur) < day1Key; cur = addDaysDate(cur, 1)) if (isStudyDay(cur, m)) index--;
    }
    return { index, rest: !isStudyDay(target, m) };
}

/**
 * Ngày học mà server xếp lại thẻ chưa học kể từ đó (`LearningPathService.placeFrom`): ngày nghỉ -> ngày học kế (chỉ số + 1),
 * trước ngày 1 -> 1. Ở ACTIVE, `totalDays` mới phải ≥ mốc này (server trả 400 kèm mốc) — tính theo ngày bắt đầu / mặt nạ
 * ĐANG gửi lên chứ không phải `today` của response cũ. Ngày bắt đầu hỏng -> 1 (không chặn, để server quyết).
 */
export function replanFromDay(startDate: string, date: Date | string, mask: string = ALL_WEEK): number {
    const pos = dayIndexForMask(startDate, date, mask);
    if (Number.isNaN(pos.index)) return MIN_DAYS;
    return Math.max(MIN_DAYS, pos.rest ? pos.index + 1 : pos.index);
}

/** "1111100" -> [true×5, false, false]; mặt nạ hỏng -> cả tuần. */
export const parseWeekdayMask = (mask: string): boolean[] => Array.from(normalizeMask(mask), (c) => c === "1");

const maskFromBits = (bits: boolean[]): string => bits.map((b) => (b ? "1" : "0")).join("");

/** Bật/tắt một ngày (0 = Thứ 2 … 6 = CN). Không cho tắt ngày học cuối cùng: server từ chối "0000000". */
export function weekdayMaskToggle(mask: string, weekday: number): string {
    const bits = parseWeekdayMask(mask);
    if (weekday < 0 || weekday > 6 || !Number.isInteger(weekday)) return maskFromBits(bits);
    if (bits[weekday] && bits.filter(Boolean).length === 1) return maskFromBits(bits);
    bits[weekday] = !bits[weekday];
    return maskFromBits(bits);
}

export const studyDaysPerWeek = (mask: string): number => parseWeekdayMask(mask).filter(Boolean).length;

/** "Cả tuần" / "T2–T6" / "T2, T4, T6" / "T2–T3, T7–CN": gộp các ngày liền nhau thành dải. */
export function studyDaysLabel(mask: string): string {
    const bits = parseWeekdayMask(mask);
    if (bits.every(Boolean)) return "Cả tuần";
    const parts: string[] = [];
    for (let i = 0; i < 7; i++) {
        if (!bits[i]) continue;
        let j = i;
        while (j + 1 < 7 && bits[j + 1]) j++;
        parts.push(j > i ? `${WEEKDAY_LABELS[i]}–${WEEKDAY_LABELS[j]}` : WEEKDAY_LABELS[i]);
        i = j;
    }
    return parts.join(", ");
}

export function isPathEnded(startDate: string | null, totalDays: number, today: Date): boolean {
    if (!startDate) return false;
    return dayKey(today) > endDate(startDate, totalDays);
}

/** "YYYY-MM-DD" -> "dd/mm" (hoặc "dd/mm/yyyy" khi `withYear`). */
export function formatShortDate(s: string, withYear = false): string {
    const [y, m, d] = s.split("-");
    return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export const formatDayRange =(from: number, to: number): string =>
    from === to ? `Ngày ${from}` : `Ngày ${from}–${to}`;

type ChapterLite = Pick<LearningPathChapter, "id" | "deckId" | "cardCount" | "dayFrom" | "dayTo" | "perDay">;

export function chapterPerDay(ch: ChapterLite): number {
    if (ch.perDay > 0) return ch.perDay;
    const days = Math.max(ch.dayTo - ch.dayFrom + 1, 1);
    return Math.ceil(ch.cardCount / days);
}

export function tasksForDay(chapters: ChapterLite[], dayIndex: number): LearningPathTask[] {
    const tasks: LearningPathTask[] = [];
    for (const ch of chapters) {
        if (!ch.deckId || dayIndex < ch.dayFrom || dayIndex > ch.dayTo) continue;
        const perDay = chapterPerDay(ch);
        const fromPos = (dayIndex - ch.dayFrom) * perDay + 1;
        if (fromPos > ch.cardCount) continue;
        const toPos = dayIndex === ch.dayTo ? ch.cardCount : Math.min(ch.cardCount, fromPos + perDay - 1);
        tasks.push({ chapterId: ch.id, deckId: ch.deckId, fromPos, toPos });
    }
    return tasks;
}

/** Số thẻ (đầu chương) đã được lên lịch tới hết ngày `dayIndex`. */
export function scheduledUpTo(ch: ChapterLite, dayIndex: number): number {
    if (dayIndex < ch.dayFrom) return 0;
    if (dayIndex >= ch.dayTo) return ch.cardCount;
    return Math.min(ch.cardCount, (dayIndex - ch.dayFrom + 1) * chapterPerDay(ch));
}

export const todayCardCount = (tasks: Pick<LearningPathTask, "fromPos" | "toPos">[]): number =>
    tasks.reduce((sum, t) => sum + (t.toPos - t.fromPos + 1), 0);

/** Đọc dải vị trí thẻ dạng "3-10" (1-based, gồm cả hai đầu). */
export function parseRange(raw: string | null): { from: number; to: number } | null {
    if (!raw) return null;
    const m = /^\s*(\d+)-(\d+)\s*$/.exec(raw);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2]);
    return from >= 1 && to >= from ? { from, to } : null;
}

export const sliceRange = <T>(cards: T[], r: { from: number; to: number }): T[] => cards.slice(r.from - 1, r.to);

/**
 * Học theo dải (lộ trình): thẻ đã ôn mà chưa đến hạn chỉ ghi log (cram), không đổi lịch SRS;
 * thẻ mới hoặc đến hạn xếp lịch bình thường.
 */
export const rangeCram = (review: Review | undefined, now: Date): boolean => !!review && !isDue(review, now);

export function chapterProgress(
    ch: Pick<LearningPathChapter, "deckId">,
    decks: Deck[],
    reviews: Record<string, Review>,
    now: Date
): DeckProgress | null {
    if (!ch.deckId) return null;
    const deck = decks.find((d) => d.id === ch.deckId);
    return deck ? calcDeckProgress(deck.cards, reviews, now) : null;
}

/** Số thẻ đã lên lịch tới hết ngày dayIndex-1 mà chưa có review nào. */
export function behindCount(
    chapters: ChapterLite[],
    dayIndex: number,
    decks: Deck[],
    reviews: Record<string, Review>
): number {
    let n = 0;
    for (const ch of chapters) {
        const deck = decks.find((d) => d.id === ch.deckId);
        if (!deck) continue;
        n += deck.cards.slice(0, scheduledUpTo(ch, dayIndex - 1)).filter((c) => !reviews[c.id]).length;
    }
    return n;
}

// ===== 2.0: tải / nợ / tiến độ (nhãn thuần cho PathActiveView, PathDraftEditor) =====

/** Nhãn tải một ngày trên biểu đồ khối lượng: "27/30 thẻ", vượt trần thêm " · vượt trần"; cap ≤ 0 = không có trần. */
export function loadLabel(load: number, cap: number): string {
    const n = Math.round(Math.max(load, 0));
    if (cap <= 0) return `${n} thẻ`;
    return `${n}/${cap} thẻ${n > cap ? " · vượt trần" : ""}`;
}

/** "Gợi ý 13 ngày (~8 thẻ mới/ngày)" ở bản nháp (spec §3.6). */
export const suggestDaysLabel = (days: number, cards: number): string =>
    `Gợi ý ${days} ngày (~${Math.ceil(cards / Math.max(days, 1))} thẻ mới/ngày)`;

export type BehindSeverity = "none" | "warn" | "severe";

/**
 * Mức cảnh báo nợ (spec §3.4): có nợ -> warn; nợ > trần/ngày hoặc > 20 % thẻ còn lại chưa học -> severe (dải
 * "Bạn đang trễ N thẻ · Học bù / Cân lại lịch / Kéo dài"). cap ≤ 0 = không trần, chỉ xét tỉ lệ.
 */
export function behindSeverity(behind: number, cap: number, remaining: number): BehindSeverity {
    if (behind <= 0) return "none";
    if (cap > 0 && behind > cap) return "severe";
    return behind > 0.2 * Math.max(remaining, 0) ? "severe" : "warn";
}

/** Một câu tóm tắt hai thước đo tiến độ (đã học / đã thuộc) + chương đã qua kiểm tra. */
export function completionPhrase(c: LearningPathCompletion): string {
    if (c.total <= 0) return "Lộ trình chưa có thẻ nào.";
    const chapters = c.chaptersTotal > 0 ? ` · ${c.chaptersPassed}/${c.chaptersTotal} chương đã qua kiểm tra` : "";
    if (c.done) return `Đã học hết ${c.total} thẻ · ${c.mastered} đã thuộc (${c.masteredPct}%)${chapters}`;
    return `Đã học ${c.learned}/${c.total} thẻ (${c.learnedPct}%) · ${c.mastered} đã thuộc (${c.masteredPct}%)${chapters}`;
}

// ===== 2.0: phiên học hợp nhất (StudyPage ?session=) =====

/** Một nguồn với studyService (lib/srs.ts): đổi CHECK của review_logs thì cả kẹp lẫn lọc đổi cùng lúc. */
export { MAX_REACTION_MS };

/** Thời gian phản xạ gửi server: làm tròn ms, kẹp 0..MAX_REACTION_MS (CHECK của review_logs); số hỏng -> undefined (không gửi). */
export function clampReactionMs(ms: number): number | undefined {
    if (!Number.isFinite(ms)) return undefined;
    return Math.min(MAX_REACTION_MS, Math.max(0, Math.round(ms)));
}

export const SESSION_KINDS: readonly SessionKind[] = ["today", "catchup", "due", "chapter"];

export const parseSessionKind = (raw: string | null): SessionKind | null =>
    raw !== null && (SESSION_KINDS as readonly string[]).includes(raw) ? (raw as SessionKind) : null;

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
    today: "Phiên hôm nay",
    catchup: "Học bù",
    due: "Ôn thẻ đến hạn",
    chapter: "Học chương",
};

export const SESSION_MODE_LABELS: Record<SessionCardMode, string> = { new: "Mới", due: "Ôn", cram: "Luyện" };

/** URL trang học cho một phiên của lộ trình: mọi nút học từ lộ trình đi qua đây (LP-14). */
export const sessionUrl = (pathId: string, kind: SessionKind, chapterId?: string | null): string =>
    `/session?session=${kind}&path=${encodeURIComponent(pathId)}${chapterId ? `&chapter=${encodeURIComponent(chapterId)}` : ""}`;

/**
 * "Ôn 5 · Nợ 3 · Mới 10" (bỏ nhóm 0); không có gì -> "0 thẻ". `cram` = số thẻ mode=cram trong phiên (đã học, chưa đến hạn —
 * server không đếm vào counts, chỉ có ở kind=chapter) -> thêm "Luyện n" để tổng các nhóm khớp số thẻ của phiên.
 */
export function sessionCountsLabel(counts: SessionCounts, cram = 0): string {
    const parts: string[] = [];
    if (counts.due > 0) parts.push(`Ôn ${counts.due}`);
    if (counts.catchup > 0) parts.push(`Nợ ${counts.catchup}`);
    if (counts.new > 0) parts.push(`Mới ${counts.new}`);
    if (cram > 0) parts.push(`Luyện ${cram}`);
    return parts.length > 0 ? parts.join(" · ") : "0 thẻ";
}

/** Tiêu đề màn hình kết thúc theo loại phiên; học bộ thẻ / dải 1.0 (kind null) giữ câu cũ. */
export const sessionDoneHeading = (kind: SessionKind | null): string =>
    kind === null || kind === "today" ? "Xong phiên hôm nay 🎉" : `Xong phiên ${SESSION_KIND_LABELS[kind].toLowerCase()} 🎉`;

/** Lời nhắn khi phiên rỗng, theo loại phiên và trạng thái ngày của lộ trình (spec §7). */
export function sessionEmptyMessage(kind: SessionKind, state: LearningPathTodayState): string {
    if (kind === "chapter") return "Chương này không còn thẻ nào để học.";
    if (state === "before") return "Lộ trình chưa bắt đầu. Hãy quay lại vào ngày bắt đầu nhé.";
    if (state === "rest") return "Hôm nay nghỉ theo lịch và không có thẻ nào đến hạn. Nghỉ ngơi nhé!";
    if (kind === "catchup") return "Bạn không nợ thẻ nào. Tuyệt!";
    if (kind === "due") return "Không có thẻ nào đến hạn ôn.";
    return state === "after"
        ? "Lộ trình đã kết thúc, không còn thẻ nợ hay đến hạn."
        : "Hôm nay không còn thẻ nào cần học.";
}

/**
 * Chế độ của thẻ khi học bộ thẻ / dải 1.0 (không có server gán): chưa chấm = mới, đến hạn = ôn, còn lại = luyện
 * (chỉ ghi log — cùng quy tắc rangeCram).
 */
export const deckCardMode = (review: Review | undefined, now: Date): SessionCardMode =>
    !review ? "new" : isDue(review, now) ? "due" : "cram";

/** Thẻ của phiên lộ trình -> Card để dùng chung Ruby / CardContent với trang học bộ thẻ. */
export const sessionCardToCard = (c: SessionCard): Card => ({
    id: c.cardId,
    term: c.term,
    reading: c.reading,
    meaning: c.meaning,
    level: c.level,
    kind: c.kind,
    readingSegments: c.readingSegments,
    hanViet: c.hanViet,
});

// ===== 2.0: trần thẻ/ngày, "hôm nay", dự báo, chương, cài đặt (PathActiveView / PathDraftEditor / Tổng quan) =====

export const MIN_DAILY_CAP = 5;
export const MAX_DAILY_CAP = 200;
/** Trùng mặc định server (app_settings learning_path_daily_cap_default, V20). */
export const DEFAULT_DAILY_CAP = 50;

export const isValidDailyCap = (n: number): boolean => Number.isInteger(n) && n >= MIN_DAILY_CAP && n <= MAX_DAILY_CAP;

/**
 * Lộ trình "đang bận" -> trang chi tiết tiếp tục poll: PROCESSING (bóc tách / chạy lại) hoặc job bóc tách đang chạy lại
 * bước dịch nghĩa ở DRAFT/ACTIVE (POST /enrich giữ nguyên trạng thái lộ trình, chỉ job chuyển RUNNING).
 */
export const isPathBusy = (p: Pick<LearningPath, "status" | "job">): boolean =>
    isPathProcessing(p.status) || p.job?.status === "QUEUED" || p.job?.status === "RUNNING";

/** Ba nhóm thẻ của một ngày (today của lộ trình / dòng today-summary). */
export interface TodayCounts {
    newCount: number;
    dueCount: number;
    behindCount: number;
}

/**
 * Số thẻ của phiên "hôm nay" theo đúng quy tắc server (GET /session?kind=today): đến hạn -> nợ (cắt sao cho
 * đến hạn + nợ + mới ≤ trần, thẻ mới hôm nay không bao giờ bị bỏ) -> mới. before / rest: chỉ đến hạn; after: đến hạn + nợ
 * (không còn thẻ mới). cap ≤ 0 = không cắt. Dùng cho nhãn "Bắt đầu phiên hôm nay (k thẻ)" mà không phải gọi /session.
 */
export function todaySessionSize(c: TodayCounts, cap: number, state: LearningPathTodayState): number {
    const due = Math.max(c.dueCount, 0);
    if (state === "before" || state === "rest") return due;
    const fresh = state === "during" ? Math.max(c.newCount, 0) : 0;
    const behind = Math.max(c.behindCount, 0);
    const room = cap > 0 ? Math.max(cap - due - fresh, 0) : behind;
    return due + Math.min(behind, room) + fresh;
}

/** "ôn 5 · nợ 3 · mới 10" — luôn đủ ba nhóm (thẻ danh sách, widget Tổng quan). */
export const todayCountsLabel = (c: TodayCounts): string =>
    `ôn ${Math.max(c.dueCount, 0)} · nợ ${Math.max(c.behindCount, 0)} · mới ${Math.max(c.newCount, 0)}`;

/**
 * Badge sidebar: tổng thẻ cần làm hôm nay của các lộ trình còn đang học = mới + đến hạn + nợ. LP-10: bỏ dòng done (đã chốt
 * hoặc học hết thẻ) — lộ trình đã xong không còn là "việc của lộ trình"; thẻ đến hạn của nó vẫn ôn được ở Bộ thẻ / Học gì tiếp.
 */
export const todaySummaryTotal = (items: readonly (TodayCounts & { done?: boolean })[]): number =>
    items.reduce(
        (s, i) => (i.done ? s : s + Math.max(i.newCount, 0) + Math.max(i.dueCount, 0) + Math.max(i.behindCount, 0)),
        0
    );

/** "Ngày 3/30" / "Nghỉ theo lịch" / "Chưa bắt đầu" / "Đã kết thúc" — nhãn ngắn cho thẻ danh sách và widget. */
export function pathDayLabel(state: LearningPathTodayState, dayIndex: number, totalDays: number): string {
    if (state === "during") return `Ngày ${dayIndex}/${totalDays}`;
    if (state === "rest") return "Nghỉ theo lịch";
    return state === "before" ? "Chưa bắt đầu" : "Đã kết thúc";
}

/** Tiêu đề khối "Hôm nay" của trang lộ trình theo trạng thái ngày (`date`, `startDate` dạng YYYY-MM-DD). */
export function todayHeading(
    state: LearningPathTodayState,
    dayIndex: number,
    totalDays: number,
    date: string,
    startDate: string
): string {
    if (state === "during") return `Hôm nay · Ngày ${dayIndex}/${totalDays} (${formatShortDate(date)})`;
    if (state === "rest") return `Hôm nay nghỉ theo lịch (${formatShortDate(date)})`;
    if (state === "before") return `Chưa bắt đầu — lộ trình bắt đầu ngày ${formatShortDate(startDate)}`;
    return "Đã kết thúc — ôn nốt thẻ đến hạn và thẻ nợ";
}

// ----- Dự báo khối lượng (WorkloadChart) -----

/** Thang chung của biểu đồ: max(tải mọi ngày, trần) để vạch trần luôn nằm trong khung; không có gì -> 1 (tránh chia 0). */
export const forecastScaleMax = (forecast: readonly Pick<LearningPathForecastDay, "load">[], cap: number): number =>
    Math.max(1, cap > 0 ? cap : 0, ...forecast.map((f) => (Number.isFinite(f.load) ? f.load : 0)));

/** Chiều cao cột theo % (0..100) trên thang `max`. */
export const barPct = (value: number, max: number): number =>
    Math.min(100, Math.max(0, (Math.max(value, 0) / Math.max(max, 1)) * 100));

/** "Ngày 3 (21/10): 8 mới + 12 ôn · 20/30 thẻ" (thêm " · vượt trần" khi quá) — tooltip cột và bảng ẩn cho screen reader. */
export const forecastDayLabel = (f: LearningPathForecastDay, cap: number): string =>
    `Ngày ${f.dayIndex} (${formatShortDate(f.date)}): ${f.newCount} mới + ${Math.round(f.predictedReviews)} ôn · ${loadLabel(f.load, cap)}`;

/** Nhãn dưới cột: chỉ ngày 1, bội số 5 và hôm nay để trục không rối khi lộ trình dài. */
export const forecastTick = (dayIndex: number, todayIndex: number | null): string =>
    dayIndex === 1 || dayIndex % 5 === 0 || dayIndex === todayIndex ? String(dayIndex) : "";

// ----- Chương (ChapterTimeline) -----

export const CHAPTER_STATE_LABELS: Record<LearningPathChapterState, string> = {
    locked: "Chưa mở",
    current: "Đang học",
    open: "Mở",
    review: "Ôn lại",
    passed: "Đã qua",
    empty: "Trống",
};

/**
 * Trạng thái chương: ưu tiên server; response 1.0 thiếu -> suy từ dải ngày (đã qua kiểm tra -> passed; hết thẻ -> empty, cùng
 * quy tắc LearningPathService.chapterState — không để chương rỗng hiện "Mở" như chương còn nợ thẻ).
 */
export function chapterStateOf(
    ch: Pick<LearningPathChapter, "state" | "quizPassedAt" | "dayFrom" | "dayTo" | "cardCount">,
    dayIndex: number
): LearningPathChapterState {
    if (ch.state) return ch.state;
    if (ch.quizPassedAt) return "passed";
    if (ch.cardCount <= 0) return "empty";
    if (ch.dayFrom > dayIndex) return "locked";
    return dayIndex <= ch.dayTo ? "current" : "open";
}

/** "Điểm cao nhất 85%"; chưa làm kiểm tra -> null. */
export const quizBestLabel = (pct: number | null | undefined): string | null =>
    pct == null || !Number.isFinite(pct) ? null : `Điểm cao nhất ${Math.round(pct)}%`;

/** Trùng mặc định server (app_settings learning_path_quiz_pass_pct, V20): response thiếu `quizPassPct` thì dùng số này. */
export const DEFAULT_QUIZ_PASS_PCT = 80;

/**
 * D4 "nhắc làm lại nếu chưa đạt": chương đã làm kiểm tra mà chưa qua -> "Chưa đạt 80%" (đi cùng nút "Làm lại", cùng luồng
 * "Kiểm tra chương"); chưa làm / đã qua -> null. Chỉ là nhãn, không khoá chương nào. Điểm cao nhất đã ≥ ngưỡng mà vẫn chưa qua
 * (admin hạ ngưỡng sau lần làm — server chỉ chấm "qua" lúc nộp) -> "Chưa qua kiểm tra" thay vì nói "chưa đạt N%" sai sự thật.
 */
export function quizRetryLabel(
    ch: Pick<LearningPathChapter, "quizBestPct" | "quizPassedAt">,
    passPct: number | null | undefined
): string | null {
    if (ch.quizPassedAt || ch.quizBestPct == null || !Number.isFinite(ch.quizBestPct)) return null;
    const pass = passPct != null && Number.isFinite(passPct) ? Math.round(passPct) : DEFAULT_QUIZ_PASS_PCT;
    return ch.quizBestPct < pass ? `Chưa đạt ${pass}%` : "Chưa qua kiểm tra";
}

// ----- Tiến độ dự phòng (response 1.0 không có `completion`) -----

/** Tính hai thước đo từ bộ thẻ + lịch ôn của máy khách; cùng quy ước floor(100·x/total) như server. */
export function completionFallback(
    chapters: Pick<LearningPathChapter, "deckId" | "quizPassedAt">[],
    decks: Deck[],
    reviews: Record<string, Review>,
    now: Date
): LearningPathCompletion {
    let total = 0;
    let learned = 0;
    let mastered = 0;
    for (const ch of chapters) {
        const deck = ch.deckId ? decks.find((d) => d.id === ch.deckId) : undefined;
        if (!deck) continue;
        total += deck.cards.length;
        learned += deck.cards.filter((c) => !!reviews[c.id]).length;
        mastered += calcDeckProgress(deck.cards, reviews, now).mastered;
    }
    const pct = (x: number) => (total > 0 ? Math.floor((100 * x) / total) : 0);
    return {
        total,
        learned,
        mastered,
        learnedPct: pct(learned),
        masteredPct: pct(mastered),
        chaptersPassed: chapters.filter((c) => !!c.quizPassedAt).length,
        chaptersTotal: chapters.length,
        done: total > 0 && learned === total,
    };
}

// ----- Dịch lại nghĩa (POST /enrich, cooldown 5 phút) -----

export const ENRICH_COOLDOWN_MS = 5 * 60_000;

/**
 * Còn hiện "Dịch lại nghĩa": job đã xong mà bước dịch không chạy được vì hết hạn mức / lỗi (no_api_key thì gọi lại vô ích).
 * Job lộ trình FAILED cũng nhận: lần dịch lại trước bị ngắt (khởi động lại giữa chừng, hàng đợi đầy) — item còn nguyên,
 * lộ trình vẫn DRAFT/ACTIVE và server (ExtractionService.reEnrichJob, forPath) vẫn cho chạy lại.
 */
export const canReEnrichPath = (job: LearningPathJob | null | undefined): boolean =>
    !!job &&
    (job.status === "DONE" || job.status === "FAILED") &&
    job.stats?.enriched !== true &&
    (job.stats?.enrichReason === "quota" || job.stats?.enrichReason === "error");

/** ms còn phải chờ trước khi server cho dịch lại (5 phút kể từ `enrichedAt`); 0 = gọi được; mốc hỏng -> 0. */
export function enrichCooldownLeft(enrichedAt: string | null | undefined, now: number): number {
    if (!enrichedAt) return 0;
    const t = Date.parse(enrichedAt);
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, t + ENRICH_COOLDOWN_MS - now);
}

/** "4:59" cho đếm ngược (làm tròn lên giây). */
export function formatCountdown(ms: number): string {
    const s = Math.ceil(Math.max(ms, 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ----- Cài đặt / cảnh báo tải -----

/** Câu cảnh báo chung khi server báo `overflow` (activate / PATCH / rebalance) hoặc `overCap` (bản nháp). */
export const OVERFLOW_WARNING = "Lịch không xếp vừa trần thẻ/ngày: hãy tăng số ngày học hoặc nâng trần mỗi ngày.";

export interface PathSettingsValues {
    totalDays: number;
    startDate: string;
    dailyCap: number;
    studyDays: string;
    reminder: boolean;
}

/** Patch chỉ gồm trường khác với lộ trình hiện tại (không có gì đổi -> {} , nơi gọi bỏ qua PATCH). */
export function settingsPatch(
    path: Pick<LearningPath, "totalDays" | "startDate" | "dailyCap" | "studyDays" | "reminder">,
    v: PathSettingsValues
): LearningPathPatch {
    const patch: LearningPathPatch = {};
    if (v.totalDays !== path.totalDays) patch.totalDays = v.totalDays;
    if (v.startDate !== path.startDate) patch.startDate = v.startDate;
    if (v.dailyCap !== (path.dailyCap ?? DEFAULT_DAILY_CAP)) patch.dailyCap = v.dailyCap;
    if (v.studyDays !== (path.studyDays ?? ALL_WEEK)) patch.studyDays = v.studyDays;
    if (v.reminder !== (path.reminder ?? false)) patch.reminder = v.reminder;
    return patch;
}

// ===== Sửa sau kiểm tay trên trình duyệt (LP-06/07/09/10/11) =====

/** Nhãn trạng thái lộ trình: ACTIVE đã chốt hoàn thành thì là "Đã hoàn thành" (thay "Đang học", không hiện cả hai). */
export const pathStatusLabel = (status: LearningPathStatus, completed: boolean): string =>
    status === "ACTIVE" && completed ? "Đã hoàn thành" : PATH_STATUS_LABELS[status];

/**
 * Bước dịch nghĩa không chạy và "Dịch lại nghĩa" cũng vô ích (vd. no_api_key: chưa cấu hình khoá Gemini) -> lý do để hiện
 * thông báo bình tĩnh thay cho dải nút. Job đang chạy / đã dịch / còn dịch lại được (quota, error) -> null.
 */
export const enrichNoticeReason = (job: LearningPathJob | null | undefined): string | null => {
    if (!job || job.status === "QUEUED" || job.status === "RUNNING") return null;
    const reason = job.stats?.enrichReason;
    if (!reason || job.stats?.enriched === true || canReEnrichPath(job)) return null;
    return reason;
};

/** Lỗi ô "Số ngày học" của bản nháp (chuỗi đang gõ); hợp lệ -> null. */
export const daysFieldError = (value: string): string | null =>
    value.trim() !== "" && isValidDays(Number(value)) ? null : `Nhập số nguyên từ ${MIN_DAYS} đến ${MAX_DAYS} ngày.`;

/** Lỗi ô "Trần thẻ mỗi ngày"; hợp lệ -> null. */
export const capFieldError = (value: string): string | null =>
    value.trim() !== "" && isValidDailyCap(Number(value)) ? null : `Nhập số nguyên từ ${MIN_DAILY_CAP} đến ${MAX_DAILY_CAP} thẻ.`;

/**
 * Vì sao "Tạo lộ trình" đang bị khoá (hiện cạnh nút); bấm được -> null. jobRunning: đang "Dịch lại nghĩa" — server trả 409 cho
 * kích hoạt tới khi job xong (LearningPathService.jobIfIdle), nên nói trước thay vì để người dùng bấm rồi nhận lỗi.
 */
export function activateBlockReason(o: {
    totalCards: number;
    daysError: string | null;
    capError: string | null;
    jobRunning?: boolean;
}): string | null {
    if (o.jobRunning) return "Đang dịch lại nghĩa: chờ xong rồi tạo lộ trình.";
    if (o.totalCards <= 0) return "Chưa chọn thẻ nào: hãy tick ít nhất một mục trong các chương để tạo lộ trình.";
    if (o.daysError) return "Sửa ô «Số ngày học» trước khi tạo lộ trình.";
    if (o.capError) return "Sửa ô «Trần thẻ mỗi ngày» trước khi tạo lộ trình.";
    return null;
}

/**
 * Bản nháp trong lúc "Dịch lại nghĩa": server từ chối (409) mọi thao tác đổi cấu trúc chương — số ngày, trần, chọn thẻ, gộp, đổi
 * tên chương, kích hoạt — cho cả bản nháp nhận ra chương lẫn không, nên các ô ấy khoá kèm câu này thay vì giữ số vừa gõ mà server
 * không lưu.
 */
export const ENRICH_LOCK_HINT = "Đang dịch lại nghĩa: số ngày, trần thẻ và các chương tạm khoá tới khi xong.";

// Tên chương tự sinh của bản nháp không nhận ra chương — cùng mẫu với LearningPathService.isDayTitle (khớp trọn chuỗi).
const DAY_CHAPTER_TITLE = /^Ngày \d+(–\d+)?$/;
const WEEK_CHAPTER_TITLE = /^Tuần \d+ \(ngày \d+(–\d+)?\)$/;

/** "Ngày 3", "Ngày 3–4" (gạch nối "–"), "Tuần 2 (ngày 8–14)": chương server tự chia lại theo thẻ đang chọn / số ngày / trần. */
export const isAutoDayChapterTitle = (title: string): boolean =>
    DAY_CHAPTER_TITLE.test(title) || WEEK_CHAPTER_TITLE.test(title);

/**
 * Hiện "Gộp vào chương trước" cho chương có chương đứng trước tên previousTitle. Bản nháp không nhận ra chương: chương trước phải
 * là chương đặt tên riêng — chương "Ngày N" được server chia lại ngay sau mỗi lần sửa nên gộp vào nó vô tác dụng (server trả 400).
 */
export const canMergeIntoPrevious = (chaptersDetected: boolean | null | undefined, previousTitle: string | undefined): boolean =>
    previousTitle !== undefined && (!!chaptersDetected || !isAutoDayChapterTitle(previousTitle));

/**
 * Khoá tải lại NGẦM danh sách mục của các chương đang mở: server chia lại chương "Ngày N" sau mỗi lần chọn thẻ / gộp / đổi số
 * ngày, trần (thẻ dời sang chương bên cạnh mà id chương — có khi cả số thẻ của chính nó — giữ nguyên), nên mọi chương đang mở phải
 * tải lại khi bố cục bất kỳ chương nào đổi. Bố cục = id + số thẻ + dải ngày của từng chương; tập thẻ chọn đổi thì tổng số thẻ
 * đổi, số xô / dải đổi thì id hoặc dải đổi.
 */
export const chapterLayoutKey = (chapters: readonly Pick<LearningPathChapter, "id" | "cardCount" | "dayFrom" | "dayTo">[]): string =>
    chapters.map((c) => `${c.id}:${c.cardCount}:${c.dayFrom}-${c.dayTo}`).join(",");

/**
 * Câu giải thích của dải nợ theo đúng lý do làm nó "severe" (behindSeverity có hai ngưỡng): vượt trần/ngày thì nói
 * "lớn hơn sức học một ngày"; chỉ vượt 20 % thẻ còn lại thì nói theo tỉ lệ — 6 thẻ nợ với trần 30 không phải quá sức.
 */
export function behindMessage(behind: number, cap: number, remaining: number): string {
    if (behindSeverity(behind, cap, remaining) !== "severe") {
        return "Học bù trong phiên hôm nay, hoặc cân lại lịch nếu muốn chia đều phần còn lại.";
    }
    if (cap > 0 && behind > cap) {
        return `Phần nợ đã lớn hơn sức học một ngày (trần ${cap} thẻ). Hãy học bù dần, hoặc cân lại lịch để các ngày còn lại gánh bớt.`;
    }
    const rest = remaining > 0 ? ` (${remaining} thẻ)` : "";
    return `Phần nợ đã chiếm hơn 20 % số thẻ còn lại chưa học${rest}. Học bù sớm để khỏi dồn về cuối lộ trình, hoặc cân lại lịch để các ngày còn lại gánh bớt.`;
}

/** Dòng "Thẻ mới hôm nay" của panel Hôm nay: học hết thẻ mới rồi thì nói rõ, không để lệch với ô "Mới 0". */
export const todayNewTasksLine = (parts: readonly string[], newCount: number): string | null =>
    parts.length === 0
        ? null
        : newCount > 0
          ? `Thẻ mới hôm nay: ${parts.join(" · ")}`
          : `Thẻ mới hôm nay (đã học xong): ${parts.join(" · ")}`;
