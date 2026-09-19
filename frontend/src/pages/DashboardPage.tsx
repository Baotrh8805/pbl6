import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import type {
  UserMetrics,
  LessonItem,
  FolderItem,
} from "@/features/dashboard/types/dashboard.types";
import {
  loadUserMetrics,
  saveUserMetrics,
  INITIAL_LESSONS,
  INITIAL_FOLDERS,
} from "@/features/dashboard/services/dashboardService";
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader";
import { DashboardSidebar } from "@/features/dashboard/components/DashboardSidebar";
import { SrsBanner } from "@/features/dashboard/components/SrsBanner";
import { LearningKpiGrid } from "@/features/dashboard/components/LearningKpiGrid";
import { RecentLessonsSection } from "@/features/dashboard/components/RecentLessonsSection";
import { FolderManagerSection } from "@/features/dashboard/components/FolderManagerSection";
import { ShareFolderModal } from "@/features/dashboard/components/modals/ShareFolderModal";
import { CreateFolderModal } from "@/features/dashboard/components/modals/CreateFolderModal";
import { EditMetricsModal } from "@/features/dashboard/components/modals/EditMetricsModal";
import { QuickAiUploadModal } from "@/features/dashboard/components/modals/QuickAiUploadModal";

export const DashboardPage: React.FC = () => {
  const { userEmail, userProfile, updateJlptLevel, logout } = useAuth();

  // User identity derived from Auth
  const currentLevel = userProfile?.jlptLevel || "N5";
  const displayName =
    userProfile?.fullName || (userEmail ? userEmail.split("@")[0] : "Học viên");

  // User Metrics State
  const [metrics, setMetrics] = useState<UserMetrics>(() =>
    loadUserMetrics(userEmail, currentLevel)
  );

  // Folders & Lessons State
  const [folders, setFolders] = useState<FolderItem[]>(INITIAL_FOLDERS);
  const [lessons] = useState<LessonItem[]>(INITIAL_LESSONS);

  // UI Interactive States
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeNavPath, setActiveNavPath] = useState("kho-tai-lieu");

  // Modals
  const [editMetricsOpen, setEditMetricsOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [shareTargetFolder, setShareTargetFolder] = useState<FolderItem | null>(null);

  // Sync metrics when userEmail or currentLevel changes
  useEffect(() => {
    const loaded = loadUserMetrics(userEmail, currentLevel);
    setMetrics(loaded);
  }, [userEmail, currentLevel]);

  // Handlers
  const handleSaveMetrics = async (updated: UserMetrics, newLevel: string) => {
    if (newLevel !== currentLevel) {
      await updateJlptLevel(newLevel);
    }
    setMetrics(updated);
    saveUserMetrics(userEmail, updated);
  };

  const handleCreateFolder = (newFolder: FolderItem) => {
    setFolders((prev) => [newFolder, ...prev]);
  };

  const handleOpenShare = (folder: FolderItem) => {
    setShareTargetFolder(folder);
  };

  const handleStartSrs = () => {
    if (metrics.srsDueCount > 0) {
      alert(`Bắt đầu phiên ôn tập SRS với ${metrics.srsDueCount} thẻ của bạn!`);
    } else {
      setUploadModalOpen(true);
    }
  };

  const handleOpenLesson = (lesson: LessonItem) => {
    alert(`Mở bài học: ${lesson.title}`);
  };

  const handleImportFile = () => {
    alert("Hỗ trợ nhập bộ thẻ từ file Anki (.apkg) và Excel (.xlsx)");
  };

  const handleOpenCommunity = () => {
    alert("Mở Thư viện cộng đồng học tiếng Nhật NihonGen AI");
  };

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      {/* 1. FIXED TOP NAVBAR */}
      <DashboardHeader
        displayName={displayName}
        userEmail={userEmail}
        currentLevel={currentLevel}
        metrics={metrics}
        onOpenEditMetrics={() => setEditMetricsOpen(true)}
        onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        onLogout={logout}
      />

      {/* 2. FIXED LEFT SIDEBAR */}
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        activePath={activeNavPath}
        onSelectNav={(path) => setActiveNavPath(path)}
        onOpenUploadModal={() => setUploadModalOpen(true)}
      />

      {/* 3. MAIN WORKSPACE */}
      <div className="md:pl-64">
        <main className="w-full pt-16 bg-surface min-h-screen px-gutter py-margin">
          <div className="flex flex-col w-full gap-space-lg pb-space-xl">
            {/* 3.1 BANNER THONG BAO SRS DEN HAN */}
            {isBannerVisible && (
              <SrsBanner
                srsDueCount={metrics.srsDueCount}
                currentLevel={currentLevel}
                onDismiss={() => setIsBannerVisible(false)}
                onStartSrs={handleStartSrs}
              />
            )}

            {/* 3.2 KHOI TOM TAT CHUNG QUA TRINH HOC TAP (4 BENTO CARDS) */}
            <LearningKpiGrid
              displayName={displayName}
              currentLevel={currentLevel}
              metrics={metrics}
              onOpenEditMetrics={() => setEditMetricsOpen(true)}
            />

            {/* 3.3 BAI HOC GAN DAY & TIEN DO */}
            <RecentLessonsSection
              lessons={lessons}
              onOpenLesson={handleOpenLesson}
              onCreateFirstLesson={() => setUploadModalOpen(true)}
            />

            {/* 3.4 QUAN LY THU MUC, TIM KIEM & CHIA SE FOLDER */}
            <FolderManagerSection
              folders={folders}
              onOpenCreateModal={() => setCreateFolderOpen(true)}
              onOpenShareModal={handleOpenShare}
              onImportFile={handleImportFile}
              onOpenCommunity={handleOpenCommunity}
            />
          </div>
        </main>
      </div>

      {/* 4. MODAL: CHIA SE THU MUC */}
      <ShareFolderModal
        isOpen={!!shareTargetFolder}
        folder={shareTargetFolder}
        onClose={() => setShareTargetFolder(null)}
      />

      {/* 5. MODAL: TAO THU MUC MOI */}
      <CreateFolderModal
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreateFolder={handleCreateFolder}
        currentLevel={currentLevel}
      />

      {/* 6. MODAL: TUY CHINH CHI SO HOC TAP */}
      <EditMetricsModal
        isOpen={editMetricsOpen}
        onClose={() => setEditMetricsOpen(false)}
        metrics={metrics}
        currentLevel={currentLevel}
        displayName={displayName}
        onSave={handleSaveMetrics}
      />

      {/* 7. MODAL: TAI TAI LIEU & BOC TACH AI */}
      <QuickAiUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        folders={folders}
      />
    </div>
  );
};

export default DashboardPage;
