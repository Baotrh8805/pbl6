import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  describeNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationFeed,
} from "@/services/notificationService";

const timeAgo = (iso: string): string => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
};

/** Chuông ở header người học: badge chưa đọc, dropdown 20 mục mới nhất. Tải khi mount và mỗi lần mở. */
export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchNotifications()
      .then((f) => {
        setFeed(f);
        setError(null);
      })
      .catch(() => setError("Không tải được thông báo."));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (id: number, to?: string, unread?: boolean) => {
    if (unread) {
      setFeed((f) => ({ unread: Math.max(0, f.unread - 1), items: f.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) }));
      void markNotificationRead(id).catch(() => {});
    }
    if (to) {
      setOpen(false);
      navigate(to);
    }
  };

  const readAll = async () => {
    setFeed((f) => ({ unread: 0, items: f.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }));
    void markAllNotificationsRead().catch(() => {});
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-surface-container-low transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={feed.unread > 0 ? `Thông báo, ${feed.unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-on-surface-variant">
          notifications
        </span>
        {feed.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-on-error text-[11px] font-bold flex items-center justify-center"
          >
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 mt-2 w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-container-high">
            <span className="font-semibold text-on-surface">Thông báo</span>
            {feed.unread > 0 && (
              <button type="button" onClick={readAll} className="text-body-sm text-primary underline">
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
          {error && <p className="px-4 py-3 text-body-sm text-error">{error}</p>}
          {!error && feed.items.length === 0 && <p className="px-4 py-6 text-body-sm text-on-surface-variant text-center">Chưa có thông báo nào.</p>}
          <ul className="divide-y divide-surface-container-high">
            {feed.items.map((n) => {
              const d = describeNotification(n);
              const unread = !n.readAt;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(n.id, d.to, unread)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors ${unread ? "bg-primary-fixed/30" : ""}`}
                  >
                    <p className={`text-body-sm ${unread ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>{d.text}</p>
                    <p className="text-label-sm text-outline mt-0.5">{timeAgo(n.createdAt)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
