import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { fetchLibrary } from "@/services/libraryService";
import { todaySummaryTotal } from "@/features/roadmap/roadmapUtils";
import { useTodaySummary } from "@/features/roadmap/useTodaySummary";
import { useAsync } from "@/lib/useAsync";
import type { UserMetrics } from "../types/dashboard.types";

interface DashboardSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  metrics?: UserMetrics;
  currentLevel?: string;
  displayName?: string;
}

interface NavItemConfig {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  renderBadge?: (ctx: {
    isActive: boolean;
    metrics?: UserMetrics;
    currentLevel?: string;
  }) => React.ReactNode;
}

interface NavSectionConfig {
  id: string;
  title: string;
  tag?: string;
  tagColor?: string;
  items: NavItemConfig[];
}

// Số bộ thẻ public trong Thư viện. Lỗi tải thì ẩn badge (không chặn điều hướng).
const LibraryCountBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { data, error } = useAsync(() => fetchLibrary({ size: 1 }), []);
  if (error) return null;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border transition-colors ${
        isActive ? "bg-white/20 text-white border-white/30" : "bg-blue-50 text-blue-700 border-blue-200/70"
      }`}
    >
      {data ? `${data.allCount} bộ` : "…"}
    </span>
  );
};

// Tổng số thẻ cần làm hôm nay (mới + đến hạn + nợ) của các lộ trình đang học, từ cache /today-summary dùng chung
// với widget Tổng quan (LP-16). 0 thẻ / lỗi / đang tải thì ẩn.
const RoadmapTodayBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { data } = useTodaySummary();
  const total = todaySummaryTotal(data ?? []);
  if (total <= 0) return null;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border transition-colors ${
        isActive ? "bg-white/20 text-white border-white/30" : "bg-blue-50 text-blue-700 border-blue-200/70"
      }`}
    >
      {total} thẻ
    </span>
  );
};

/** Badge "N bộ cần ôn" của mục Bộ Thẻ Của Tôi: bấm là tới danh sách bộ thẻ cần ôn (span role=link vì đang nằm trong NavLink). */
const DueDecksBadge: React.FC<{ isActive: boolean; metrics?: UserMetrics }> = ({ isActive, metrics }) => {
  const navigate = useNavigate();
  const dueDecks = metrics?.dueDecks ?? 0;
  const due = metrics?.dueToday ?? 0;
  const fresh = metrics?.newCards ?? 0;
  if (dueDecks <= 0 && fresh <= 0) return null;
  if (dueDecks <= 0) {
    return (
      <span
        title={`${fresh} thẻ mới chưa học`}
        className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full transition-colors ${
          isActive ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant border border-outline-variant/60"
        }`}
      >
        {fresh} mới
      </span>
    );
  }
  const go = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate("/decks?filter=due");
  };
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(e)}
      title={`${due} thẻ đã học đến hạn ôn trong ${dueDecks} bộ thẻ — bấm để xem danh sách`}
      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full transition-colors cursor-pointer ${
        isActive ? "bg-white/20 text-white hover:bg-white/30" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
      }`}
    >
      {dueDecks} bộ cần ôn
    </span>
  );
};

const SECTIONS: NavSectionConfig[] = [
  {
    id: "personal",
    title: "Bản Thân & Học Tập",
    tag: "Cá nhân",
    tagColor: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
    items: [
      { to: "/", icon: "dashboard", label: "Tổng Quan", end: true },
      {
        to: "/decks",
        icon: "style",
        label: "Bộ Thẻ Của Tôi",
        // Rà soát 27/10: badge đếm BỘ THẺ có thẻ đã học đến hạn (không phải số thẻ) và bấm vào mở thẳng danh sách bộ thẻ cần
        // ôn (/decks?filter=due). Không có bộ nào đến hạn mà còn thẻ mới thì nhắc nhẹ "{m} mới".
        renderBadge: ({ isActive, metrics }) => <DueDecksBadge isActive={isActive} metrics={metrics} />,
      },
      { to: "/folders", icon: "folder", label: "Thư Mục Học" },
      { to: "/extractions", icon: "document_scanner", label: "Bóc Tách AI" },
    ],
  },
  {
    id: "practice",
    title: "Luyện Thi & Thử Thách",
    tag: "Luyện thi",
    tagColor: "text-amber-700 bg-amber-50 border-amber-200/60",
    items: [
      {
        to: "/roadmap",
        icon: "alt_route",
        label: "Lộ Trình Học Tập",
        renderBadge: ({ isActive }) => <RoadmapTodayBadge isActive={isActive} />,
      },
      {
        to: "/classrooms",
        icon: "school",
        label: "Lớp Học",
      },
      {
        to: "/quiz",
        icon: "quiz",
        label: "Phòng Thi Quiz",
        renderBadge: ({ isActive }) => (
          <span
            className={`w-2 h-2 rounded-full ${
              isActive ? "bg-emerald-300" : "bg-emerald-500 ring-2 ring-emerald-100"
            }`}
            title="Đang hoạt động"
          />
        ),
      },
    ],
  },
  {
    id: "community",
    title: "Cộng Đồng & Khám Phá",
    tag: "Cộng đồng",
    tagColor: "text-blue-700 bg-blue-50 border-blue-200/60",
    items: [
      {
        to: "/library",
        icon: "auto_stories",
        label: "Thư Viện Cộng Đồng",
        renderBadge: ({ isActive }) => <LibraryCountBadge isActive={isActive} />,
      },
      // Từ điển (spec 2026-10-26): tra từ vựng + Hán tự & bộ thủ + bản đồ Hán-Việt + sổ tay, bình luận, báo lỗi
      { to: "/dictionary", icon: "menu_book", label: "Từ Điển" },
      // Đồ thị tri thức Neo4j + GraphRAG (spec 2026-10-27): khám phá quan hệ từ – chữ Hán – ngữ pháp, gợi ý, hỏi đáp
      { to: "/graph", icon: "account_tree", label: "Sơ Đồ Chữ Hán" },
    ],
  },
];

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  mobileOpen,
  onCloseMobile,
  metrics,
  currentLevel = "N5",
  displayName = "Học viên",
}) => {
  const initial = displayName.trim().charAt(0).toUpperCase() || "H";

  return (
    <>
      {mobileOpen && (
        // Lớp phủ chỉ để bấm ra ngoài đóng menu; nút hamburger trên header vẫn là cách đóng bằng bàn phím.
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest/95 backdrop-blur-md shadow-[1px_0_8px_rgba(4,21,52,0.03)] z-40 flex flex-col justify-between p-3.5 border-r border-surface-container-high/40 transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Navigation list */}
        <div className="overflow-y-auto space-y-4 pr-0.5 flex-1 select-none">
          {SECTIONS.map((section, idx) => (
            <div key={section.id}>
              {idx > 0 && <div className="border-t border-surface-container-high/40 my-3" />}

              <div className="px-2 pb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wider uppercase text-outline">
                <span>{section.title}</span>
                {section.tag && (
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border normal-case tracking-normal ${section.tagColor}`}
                  >
                    {section.tag}
                  </span>
                )}
              </div>

              <nav className="space-y-0.5" aria-label={section.title}>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
                        isActive
                          ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`material-symbols-outlined text-[20px] shrink-0 ${
                              isActive ? "text-white" : "text-outline"
                            }`}
                            aria-hidden="true"
                          >
                            {item.icon}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.renderBadge && (
                          <div className="shrink-0 ml-1.5">
                            {item.renderBadge({ isActive, metrics, currentLevel })}
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Chân Sidebar: Mini Streak Widget & Profile link */}
        <div className="shrink-0 pt-3 border-t border-surface-container-high/50 space-y-2 bg-surface-container-lowest">
          {/* Mini Streak Widget */}
          <div className="lg:hidden bg-gradient-to-r from-orange-50/80 to-amber-50/80 border border-orange-200/70 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[22px] text-amber-600 select-none shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">local_fire_department</span>
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-orange-950 truncate leading-tight">
                  Chuỗi {metrics?.currentStreak ?? 0} ngày
                </div>
                <div className="text-[10px] text-orange-800 truncate">
                  {/* Server đếm mỗi lần chấm là một lượt (một thẻ có thể chấm nhiều lần); suy luận thì đếm theo thẻ */}
                  Hôm nay: {metrics?.reviewedToday ?? 0}/{metrics?.dailyGoalWords ?? 20}{" "}
                  {metrics?.activitySource === "server" ? "lượt" : "thẻ"}
                </div>
              </div>
            </div>
            <NavLink
              to="/decks"
              onClick={onCloseMobile}
              className="text-[10px] font-bold px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-md shadow-xs transition-colors shrink-0 whitespace-nowrap"
            >
              Học tiếp
            </NavLink>
          </div>

          {/* Profile & Setting Link */}
          <NavLink
            to="/profile"
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `flex items-center justify-between p-2 rounded-xl transition-all ${
                isActive
                  ? "bg-primary-container text-on-primary shadow-sm"
                  : "hover:bg-surface-container text-on-surface"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ring-2 ${
                      isActive
                        ? "bg-white text-primary ring-white/30"
                        : "bg-primary text-white ring-blue-100"
                    }`}
                  >
                    {initial}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold truncate max-w-[125px]">
                      {displayName}
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? "text-on-primary/80" : "text-outline"
                      }`}
                    >
                      Trang cá nhân &bull; {currentLevel}
                    </div>
                  </div>
                </div>
                <span
                  className={`material-symbols-outlined text-[18px] shrink-0 ${
                    isActive ? "text-on-primary/80" : "text-outline"
                  }`}
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </>
            )}
          </NavLink>
        </div>
      </aside>
    </>
  );
};
