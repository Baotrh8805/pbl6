// B5.6: tên tệp xuất (CSV / Anki) theo GIỜ MÁY người dùng. toISOString() là UTC: 23:30 giờ Việt Nam đã sang ngày mới, tên
// tệp "…-2026-10-28" trong khi người dùng đang ở 27/10. Hàm thuần, selfcheck chạy với TZ=Asia/Saigon.

/** yyyy-mm-dd theo múi giờ máy. */
export const localDateStamp = (d: Date = new Date()): string => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Tiền tố tên tệp an toàn: bỏ dấu, chữ thường, chỉ a-z 0-9 và gạch nối ("Bộ thẻ N5" -> "bo-the-n5"). */
export const fileSlug = (s: string): string =>
    s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tep";

/** "<tiền tố>-<yyyy-mm-dd>.<đuôi>" (đuôi không có dấu chấm). */
export const datedFileName = (prefix: string, ext: string, d: Date = new Date()): string =>
    `${fileSlug(prefix)}-${localDateStamp(d)}.${ext.replace(/^\./, "")}`;
