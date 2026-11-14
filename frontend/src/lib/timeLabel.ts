// Nhãn thời gian tương đối cho thẻ bộ thẻ / thư mục (rà soát 27/10): "Hôm nay", "Hôm qua", "3 ngày trước", "12/10/2026".
// Hàm thuần theo ngày lịch địa phương của máy khách (như dayKey của learningStats), import tương đối để selfcheck chạy được.

const DAY_MS = 86_400_000;

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Số ngày lịch giữa iso và now (0 = hôm nay, 1 = hôm qua, âm = tương lai); null khi iso không đọc được. */
export function dayDiff(iso: string | null | undefined, now: Date = new Date()): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.round((startOfDay(now) - startOfDay(new Date(t))) / DAY_MS);
}

export function relativeDayLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
    const d = dayDiff(iso, now);
    if (d === null) return null;
    if (d <= 0) return "Hôm nay";
    if (d === 1) return "Hôm qua";
    if (d < 7) return `${d} ngày trước`;
    if (d < 30) return `${Math.floor(d / 7)} tuần trước`;
    const t = new Date(Date.parse(iso as string));
    const sameYear = t.getFullYear() === now.getFullYear();
    const dd = String(t.getDate()).padStart(2, "0");
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    return sameYear ? `${dd}/${mm}` : `${dd}/${mm}/${t.getFullYear()}`;
}

/** iso nằm trong `days` ngày lịch gần nhất (kể cả hôm nay)? Không có mốc -> false. */
export function withinDays(iso: string | null | undefined, days: number, now: Date = new Date()): boolean {
    const d = dayDiff(iso, now);
    return d !== null && d >= 0 && d < days;
}
