import type { Grade } from "@/lib/srs";

export interface GradeItem {
    grade: Grade;
    label: string;
    key: string;
    /** Style nút bấm trên StudyPage: nền pastel nhạt + viền màu + chữ tương phản cao (chuẩn WCAG AA). */
    className: string;
    buttonClassName: string;
    kbdClassName: string;
    /** Màu solid dùng cho thanh phân bố và chấm tròn trong StudySummary. */
    barClassName: string;
    dotClassName: string;
}

/** Nút chấm trên trang học + màu trong màn tổng kết: một nguồn cho nhãn / phím / màu. */
export const GRADES: GradeItem[] = [
    {
        grade: "again",
        label: "Lại",
        key: "1",
        className: "bg-red-50 hover:bg-red-100/90 text-red-700 border border-red-200/90 active:bg-red-200 focus-visible:ring-red-500",
        buttonClassName: "bg-red-50 hover:bg-red-100/90 text-red-700 border border-red-200/90 active:bg-red-200 focus-visible:ring-red-500",
        kbdClassName: "bg-red-200/60 text-red-800",
        barClassName: "bg-rose-500",
        dotClassName: "bg-rose-500",
    },
    {
        grade: "hard",
        label: "Khó",
        key: "2",
        className: "bg-amber-50 hover:bg-amber-100/90 text-amber-800 border border-amber-200/90 active:bg-amber-200 focus-visible:ring-amber-500",
        buttonClassName: "bg-amber-50 hover:bg-amber-100/90 text-amber-800 border border-amber-200/90 active:bg-amber-200 focus-visible:ring-amber-500",
        kbdClassName: "bg-amber-200/60 text-amber-900",
        barClassName: "bg-amber-500",
        dotClassName: "bg-amber-500",
    },
    {
        grade: "good",
        label: "Tốt",
        key: "3",
        className: "bg-blue-50 hover:bg-blue-100/90 text-blue-700 border border-blue-300 active:bg-blue-200 font-bold focus-visible:ring-blue-500",
        buttonClassName: "bg-blue-50 hover:bg-blue-100/90 text-blue-700 border border-blue-300 active:bg-blue-200 font-bold focus-visible:ring-blue-500",
        kbdClassName: "bg-blue-200/60 text-blue-800",
        barClassName: "bg-blue-500",
        dotClassName: "bg-blue-500",
    },
    {
        grade: "easy",
        label: "Dễ",
        key: "4",
        className: "bg-emerald-50 hover:bg-emerald-100/90 text-emerald-700 border border-emerald-200/90 active:bg-emerald-200 font-bold focus-visible:ring-emerald-500",
        buttonClassName: "bg-emerald-50 hover:bg-emerald-100/90 text-emerald-700 border border-emerald-200/90 active:bg-emerald-200 font-bold focus-visible:ring-emerald-500",
        kbdClassName: "bg-emerald-200/60 text-emerald-800",
        barClassName: "bg-emerald-500",
        dotClassName: "bg-emerald-500",
    },
];
