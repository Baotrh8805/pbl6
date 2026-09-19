import React from "react";

interface DashboardSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activePath?: string;
  onSelectNav?: (path: string) => void;
  onOpenUploadModal?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  mobileOpen,
  onCloseMobile,
  activePath = "kho-tai-lieu",
  onSelectNav,
  onOpenUploadModal,
}) => {
  const handleNavClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (path === "studio-phan-tich" && onOpenUploadModal) {
      onOpenUploadModal();
    } else if (onSelectNav) {
      onSelectNav(path);
    }
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest/90 backdrop-blur-md shadow-[1px_0_8px_rgba(4,21,52,0.03)] z-40 flex flex-col p-space-md border-r border-surface-container-high/40 transition-transform duration-300 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
      >
        <div className="space-y-space-md overflow-y-auto flex-1">
          {/* Nhóm 1: Không Gian Học Tập */}
          <div>
            <div className="px-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline mb-1.5 font-semibold">
              Không Gian Học Tập
            </div>
            <nav className="flex flex-col gap-1">
              <a
                href="#studio"
                onClick={(e) => handleNavClick(e, "studio-phan-tich")}
                className={`flex items-center gap-space-sm px-3 py-2.5 rounded-lg transition-all font-label-md text-label-md ${activePath === "studio-phan-tich"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                <span>Studio Phân Tích</span>
              </a>

              <a
                href="#flashcards"
                onClick={(e) => handleNavClick(e, "bo-the-flashcard")}
                className={`flex items-center gap-space-sm px-3 py-2.5 rounded-lg transition-all font-label-md text-label-md ${activePath === "bo-the-flashcard"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">style</span>
                <span>Bộ Thẻ Flashcard</span>
              </a>

              <a
                href="#quiz"
                onClick={(e) => handleNavClick(e, "luyen-thi-quiz")}
                className={`flex items-center gap-space-sm px-3 py-2.5 rounded-lg transition-all font-label-md text-label-md ${activePath === "luyen-thi-quiz"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">quiz</span>
                <span>Luyện Thi Quiz</span>
              </a>

              <a
                href="#srs"
                onClick={(e) => handleNavClick(e, "on-tap-srs")}
                className={`flex items-center gap-space-sm px-3 py-2.5 rounded-lg transition-all font-label-md text-label-md ${activePath === "on-tap-srs"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">history_edu</span>
                <span>Ôn Tập SRS</span>
              </a>
            </nav>
          </div>

          {/* Nhóm 2: Thư Viện & Phân Tích */}
          <div className="pt-space-sm">
            <div className="px-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline mb-1.5 font-semibold">
              Thư Viện &amp; Phân Tích
            </div>
            <nav className="flex flex-col gap-1">
              <a
                href="#kho-tai-lieu"
                onClick={(e) => handleNavClick(e, "kho-tai-lieu")}
                className={`flex items-center gap-space-sm px-3 py-2 rounded-lg font-label-md text-label-md transition-all ${activePath === "kho-tai-lieu"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">folder_open</span>
                <span>Kho Tài Liệu</span>
              </a>

              <a
                href="#so-tay"
                onClick={(e) => handleNavClick(e, "so-tay-kanji")}
                className={`flex items-center gap-space-sm px-3 py-2 rounded-lg font-label-md text-label-md transition-all ${activePath === "so-tay-kanji"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">translate</span>
                <span>Sổ Tay Kanji &amp; Từ Vựng</span>
              </a>

              <a
                href="#tien-do"
                onClick={(e) => handleNavClick(e, "thong-ke-tien-do")}
                className={`flex items-center gap-space-sm px-3 py-2 rounded-lg font-label-md text-label-md transition-all ${activePath === "thong-ke-tien-do"
                    ? "bg-primary-container text-on-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">monitoring</span>
                <span>Tiến Độ Học Tập</span>
              </a>
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
};
