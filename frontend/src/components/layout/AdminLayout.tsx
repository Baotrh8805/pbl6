import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import type { Role } from "@/lib/roles";
import { DATA_CHANGED_EVENT } from "@/services/apiClient";
import { fetchReports } from "@/services/adminService";
import { RoleStatusBadge } from "@/features/admin/components/AdminStatusBadge";

interface NavItem {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    name: "Vận hành",
    items: [
      { to: "/admin", icon: "monitoring", label: "Tổng quan hệ thống", end: true },
      { to: "/admin/users", icon: "group", label: "Người dùng" },
      { to: "/admin/decks", icon: "style", label: "Nội dung" },
      { to: "/admin/reports", icon: "flag", label: "Báo cáo" },
    ],
  },
  {
    name: "Hệ thống",
    items: [
      { to: "/admin/audit", icon: "history", label: "Nhật ký" },
      { to: "/admin/settings", icon: "settings", label: "Cấu hình" },
    ],
  },
];

export const AdminLayout: React.FC = () => {
  const { userEmail, userProfile, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("admin.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin.sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Bỏ qua
      }
      return next;
    });
  };

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
            <span className="hidden sm:block text-body-sm text-on-surface-variant truncate max-w-[200px]" title={userEmail ?? ""}>
              {userEmail}
            </span>
            {role && <RoleStatusBadge role={role} />}
            <button
              type="button"
              onClick={logout}
              className="text-body-sm font-semibold text-on-surface-variant hover:text-error px-2 py-1 rounded-lg hover:bg-surface-container cursor-pointer transition-colors"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div aria-hidden="true" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-inverse-surface/40 md:hidden" />
      )}

      {/* Sidebar: w-64 mặc định, w-16 khi thu gọn trên desktop */}
      <aside
        id="admin-sidebar"
        className={`fixed left-0 top-16 bottom-0 z-40 bg-surface-container-lowest/95 backdrop-blur-md border-r border-surface-container-high/40 flex flex-col justify-between transition-all duration-300 ${
          isCollapsed ? "md:w-16 p-2" : "md:w-64 p-3.5"
        } ${mobileOpen ? "w-64 p-3.5 translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <nav className="space-y-4 overflow-y-auto" aria-label="Quản trị">
          {NAV_GROUPS.map((group) => (
            <div key={group.name} className="space-y-1">
              {!isCollapsed && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-outline px-3 py-1">
                  {group.name}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center ${
                      isCollapsed ? "justify-center px-2" : "justify-between px-3"
                    } py-2 rounded-lg text-[13px] font-medium transition-all ${
                      isActive
                        ? "bg-primary-container text-on-primary shadow-sm font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-secondary before:rounded-r"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          aria-hidden="true"
                          className={`material-symbols-outlined text-[20px] shrink-0 ${
                            isActive ? "text-white" : "text-outline"
                          }`}
                        >
                          {item.icon}
                        </span>
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </span>

                      {/* Badge báo cáo mở: pill khi mở rộng, dot nhỏ góc icon khi thu gọn */}
                      {item.to === "/admin/reports" && openCount > 0 && (
                        isCollapsed ? (
                          <span
                            className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-surface-container-lowest"
                            aria-label={`${openCount} báo cáo đang mở`}
                          />
                        ) : (
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-error text-white"
                            aria-label={`${openCount} báo cáo đang mở`}
                          >
                            {openCount}
                          </span>
                        )
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Nút thu gọn/mở rộng sidebar trên desktop */}
        <div className="hidden md:block pt-2 border-t border-surface-container-high/40">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            aria-label={isCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            className="w-full flex items-center justify-center p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              {isCollapsed ? "chevron_right" : "chevron_left"}
            </span>
            {!isCollapsed && <span className="ml-2 text-label-sm font-semibold">Thu gọn</span>}
          </button>
        </div>
      </aside>

      {/* Main content padding đồng bộ với trạng thái thu gọn */}
      <div className={`transition-all duration-300 ${isCollapsed ? "md:pl-16" : "md:pl-64"}`}>
        <main className="w-full pt-16 min-h-screen px-gutter py-margin">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
