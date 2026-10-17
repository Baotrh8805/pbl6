import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { DATA_CHANGED_EVENT } from "@/services/apiClient";
import { fetchReports } from "@/services/adminService";

/**
 * Khung Admin Panel: header + sidebar 6 mục + Outlet. Không gọi API học tập (staff không có bộ thẻ).
 * Badge báo cáo mở tải lại sau mỗi thao tác ghi (data:changed từ apiClient).
 */
const NAV = [
  { to: "/admin", icon: "monitoring", label: "Tổng quan hệ thống", end: true },
  { to: "/admin/users", icon: "group", label: "Người dùng" },
  { to: "/admin/decks", icon: "style", label: "Nội dung" },
  { to: "/admin/reports", icon: "flag", label: "Báo cáo" },
  { to: "/admin/audit", icon: "history", label: "Nhật ký" },
  { to: "/admin/settings", icon: "settings", label: "Cấu hình" },
];

export const AdminLayout: React.FC = () => {
  const { userEmail, userProfile, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const open = useAsync(() => fetchReports({ status: "OPEN", size: 1 }), [version]);

  useEffect(() => {
    let timer: number | undefined;
    const onChanged = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVersion((v) => v + 1), 300);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChanged);
    };
  }, []);

  const openCount = open.data?.total ?? 0;
  const role = userProfile?.role as Role | undefined;

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-surface-container-high/40 shadow-[0_1px_8px_rgba(4,21,52,0.05)]">
        <div className="h-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container cursor-pointer"
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <img alt="" className="h-8 w-auto shrink-0" src="/favicon.svg" />
            <span className="font-headline-sm text-headline-sm text-primary font-bold whitespace-nowrap">NihonGen AI</span>
            <span className="hidden sm:inline text-label-sm px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-semibold">
              Quản trị
            </span>
          </div>
          <div className="flex items-center gap-space-sm min-w-0">
            <span className="hidden sm:block text-body-sm text-on-surface-variant truncate" title={userEmail ?? ""}>
              {userEmail}
            </span>
            {role && (
              <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-semibold whitespace-nowrap">
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="text-body-sm font-semibold text-on-surface-variant hover:text-error px-2 py-1 rounded-lg hover:bg-surface-container cursor-pointer"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div aria-hidden="true" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-inverse-surface/40 md:hidden" />
      )}

      <aside
        id="admin-sidebar"
        className={`fixed left-0 top-16 bottom-0 w-64 z-40 bg-surface-container-lowest/95 backdrop-blur-md border-r border-surface-container-high/40 p-3.5 transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="space-y-0.5" aria-label="Quản trị">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${isActive ? "text-white" : "text-outline"}`}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.to === "/admin/reports" && openCount > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-error text-white"
                      aria-label={`${openCount} báo cáo đang mở`}
                    >
                      {openCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="md:pl-64">
        <main className="w-full pt-16 min-h-screen px-gutter py-margin">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
