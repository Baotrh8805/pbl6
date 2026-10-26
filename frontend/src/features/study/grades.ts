import type { Grade } from "@/lib/srs";

/** Nút chấm trên trang học + màu trong màn tổng kết: một nguồn cho nhãn / phím / màu. */
export const GRADES: { grade: Grade; label: string; key: string; className: string }[] = [
    { grade: "again", label: "Lại", key: "1", className: "bg-error text-on-primary" },
    { grade: "hard", label: "Khó", key: "2", className: "bg-surface-container-high text-on-surface" },
    { grade: "good", label: "Tốt", key: "3", className: "bg-primary text-on-primary" },
    { grade: "easy", label: "Dễ", key: "4", className: "bg-secondary text-on-primary" },
];
