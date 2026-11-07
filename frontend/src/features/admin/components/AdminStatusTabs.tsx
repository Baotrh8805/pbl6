import { Link } from "react-router-dom";

export interface AdminStatusTab<K extends string> {
  key: K;
  label: string;
  icon: string;
  /** Số hiện trên tab (vd hàng đợi chờ xử lý); null/undefined = không hiện. */
  count?: number | null;
  /** Tab "cần xử lý": số > 0 tô đỏ để nổi bật như badge báo cáo mở. */
  urgent?: boolean;
}

interface AdminStatusTabsProps<K extends string> {
  /** Nhãn cho trình đọc màn hình của cả dải tab. */
  label: string;
  tabs: readonly AdminStatusTab<K>[];
  active: K;
  /** Link của từng tab (giữ trạng thái trên URL để chia sẻ được, nút Back hoạt động). */
  hrefFor: (key: K) => string;
}

/** Dải tab trạng thái dạng link (giống trang Báo cáo): tab đang mở có aria-current="page". */
export function AdminStatusTabs<K extends string>({ label, tabs, active, hrefFor }: AdminStatusTabsProps<K>) {
  return (
    <nav
      className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit max-w-full"
      aria-label={label}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        const showCount = typeof t.count === "number";
        return (
          <Link
            key={t.key}
            to={hrefFor(t.key)}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all ${
              isActive
                ? "bg-surface-container-lowest text-primary shadow-xs"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              {t.icon}
            </span>
            <span>{t.label}</span>
            {showCount && (
              <span
                className={`ml-0.5 px-1.5 rounded-full text-label-sm font-bold ${
                  t.urgent && (t.count ?? 0) > 0 ? "bg-error text-white" : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
