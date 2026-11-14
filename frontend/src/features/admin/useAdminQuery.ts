import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Bộ lọc + trang nằm trong URL (useSearchParams của react-router): chia sẻ link được, nút Back hoạt động,
 * không cần state lib. Đổi bộ lọc thì về trang 0.
 */
export function useAdminQuery(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const get = (key: string): string => params.get(key) ?? defaults[key] ?? "";
  const page = Number(params.get("page") ?? 0) || 0;

  const set = useCallback(
    (patch: Record<string, string | number | undefined>, keepPage = false) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === "" || v === null) next.delete(k);
          else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        return next;
      });
    },
    [setParams]
  );

  const setPage = useCallback((p: number) => set({ page: p > 0 ? p : undefined }, true), [set]);

  /** Khoá để useAsync nhận ra thay đổi (chuỗi query đã sắp xếp). */
  const key = params.toString();
  return { get, page, set, setPage, key };
}
