import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import type { FolderItem } from "@/features/dashboard/types/dashboard.types";
import { fetchFolders } from "@/services/folderService";
import { useAsync } from "@/lib/useAsync";
import { AddExistingDeckModal } from "@/features/decks/components/AddExistingDeckModal";
import { ShareFolderModal } from "@/features/folders/components/ShareFolderModal";
import { DailyMissionHero } from "@/features/dashboard/components/DailyMissionHero";
import { LearningKpiGrid } from "@/features/dashboard/components/LearningKpiGrid";
import { RecentDecksSection } from "@/features/dashboard/components/RecentDecksSection";
import { WeaknessRadarCard } from "@/features/dashboard/components/WeaknessRadarCard";
import { QuickActionDock } from "@/features/dashboard/components/QuickActionDock";
import { CreateFolderModal } from "@/features/dashboard/components/modals/CreateFolderModal";
import { QuickAiUploadModal } from "@/features/dashboard/components/modals/QuickAiUploadModal";
import { TodayPathWidget } from "@/features/dashboard/components/TodayPathWidget";
import { NextStepsCard } from "@/features/insights/components/NextStepsCard";

export const DashboardPage: React.FC = () => {
  const {
    metrics,
    decks,
    reviews,
    statsLoading,
    statsError,
    reloadStats,
    displayName,
    currentLevel,
    openEditMetrics,
  } = useShell();
  const navigate = useNavigate();

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [shareTargetFolder, setShareTargetFolder] = useState<FolderItem | null>(null);
  const [addDeckFolder, setAddDeckFolder] = useState<FolderItem | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Thư mục thật từ API: xem chi tiết và cây phân cấp đầy đủ ở /folders
  const foldersState = useAsync(fetchFolders, [refreshIndex]);
  const foldersCount = (foldersState.data ?? []).length;

  return (
    <div className="flex flex-col w-full gap-6 pb-12">
      {statsError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">Lỗi tải dữ liệu:</span>
            <span>{statsError}</span>
          </div>
          <button
            type="button"
            onClick={reloadStats}
            className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 font-medium text-xs transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 1. Header & 4 Bento KPI Vital Cards: Động lực và mục tiêu cấp độ JLPT */}
      <LearningKpiGrid
        displayName={displayName}
        currentLevel={currentLevel}
        metrics={metrics}
        loading={statsLoading}
        onOpenEditMetrics={openEditMetrics}
      />

      {/* 2. Unified Daily Mission Hero: 1 Điểm chạm duy nhất để bắt đầu phiên học hôm nay */}
      <DailyMissionHero
        metrics={metrics}
        currentLevel={currentLevel}
        loading={statsLoading}
      />

      {/* 3. Asymmetric 2-Column Layout (Desktop 67% - 33%): Trọng tâm học tập & Hỗ trợ trí tuệ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT CHÍNH (67% - lg:col-span-8): Không gian học tập thực tế */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Bộ thẻ gần đây và đang học (2-column grid rộng rãi, thanh tiến độ phân đoạn) */}
          <RecentDecksSection decks={decks} reviews={reviews} loading={statsLoading} />

          {/* Lộ trình hôm nay (Roadmap 2.0 - Tự ẩn nếu chưa có lộ trình active) */}
          <TodayPathWidget />

          {/* Gợi ý học tiếp thông minh */}
          <NextStepsCard compact exclude={["path_today", "catchup", "due"]} />
        </div>

        {/* CỘT PHỤ (33% - lg:col-span-4): Điểm yếu cần chú ý & Lối tắt thao tác nhanh */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Radar Điểm Yếu: Top 3 từ hay quên nhất được lọc từ dữ liệu ôn tập */}
          <WeaknessRadarCard decks={decks} reviews={reviews} loading={statsLoading} />

          {/* Quick Action Dock: Thay thế khối thư mục chiếm diện tích trước đây */}
          <QuickActionDock
            foldersCount={foldersCount}
            onOpenCreateFolder={() => setCreateFolderOpen(true)}
            onImportFile={() => setUploadModalOpen(true)}
            onOpenCommunity={() => navigate("/library")}
          />
        </div>
      </div>

      {/* Modals */}
      <ShareFolderModal
        isOpen={!!shareTargetFolder}
        folder={shareTargetFolder}
        onClose={() => setShareTargetFolder(null)}
        onChanged={() => setRefreshIndex((i) => i + 1)}
      />

      <CreateFolderModal
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreated={() => setRefreshIndex((i) => i + 1)}
        currentLevel={currentLevel}
      />

      {addDeckFolder && (
        <AddExistingDeckModal
          isOpen
          targetFolder={{ id: addDeckFolder.id, title: addDeckFolder.title }}
          onClose={() => setAddDeckFolder(null)}
          onSuccess={() => {
            setRefreshIndex((i) => i + 1);
            reloadStats();
          }}
        />
      )}

      {/* Modal bóc tách tài liệu AI */}
      <QuickAiUploadModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
    </div>
  );
};

export default DashboardPage;
