import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShell } from "@/components/layout/shellContext";
import type { FolderItem } from "@/features/dashboard/types/dashboard.types";
import { toFolderItem } from "@/features/dashboard/lib/dashboardUtils";
import { fetchFolders } from "@/services/folderService";
import { useAsync } from "@/lib/useAsync";
import { AddExistingDeckModal } from "@/features/decks/components/AddExistingDeckModal";
import { ShareFolderModal } from "@/features/folders/components/ShareFolderModal";
import { SrsBanner } from "@/features/dashboard/components/SrsBanner";
import { LearningKpiGrid } from "@/features/dashboard/components/LearningKpiGrid";
import { RecentDecksSection } from "@/features/dashboard/components/RecentDecksSection";
import { FolderManagerSection } from "@/features/dashboard/components/FolderManagerSection";
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

  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [shareTargetFolder, setShareTargetFolder] = useState<FolderItem | null>(null);
  const [addDeckFolder, setAddDeckFolder] = useState<FolderItem | null>(null);
  // Tăng để fetch lại sau khi tạo thư mục / thêm bộ thẻ -> danh sách không bị cũ.
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Thư mục thật từ API: id là UUID nên nút "Thêm bộ thẻ" gọi được backend.
  // ponytail: dashboard chỉ hiện thư mục gốc; xem cây đầy đủ ở trang /folders.
  const foldersState = useAsync(fetchFolders, [refreshIndex]);
  const folders: FolderItem[] = useMemo(() => (foldersState.data ?? []).map(toFolderItem), [foldersState.data]);

  // Đếm bộ thẻ/thẻ nằm trực tiếp trong từng thư mục từ danh sách bộ thẻ layout đã tải.
  const folderStats = useMemo(() => {
    const out: Record<string, { decks: number; cards: number }> = {};
    for (const d of decks) {
      if (!d.folderId) continue;
      const s = (out[d.folderId] ??= { decks: 0, cards: 0 });
      s.decks++;
      s.cards += d.cards.length;
    }
    return out;
  }, [decks]);

  return (
    <div className="flex flex-col w-full gap-space-lg pb-space-xl">
      {/* Lộ trình 2.0 (LP-9): "hôm nay của lộ trình" lên đầu Tổng quan; tự ẩn khi không có lộ trình đang học. */}
      <TodayPathWidget />
      {/* F3 "Học gì tiếp" bản gọn: bỏ phiên hôm nay / học bù vì TodayPathWidget ngay trên đã hiện; tự ẩn khi không có gợi ý. */}
      <NextStepsCard compact exclude={["path_today", "catchup"]} />

      {isBannerVisible && !statsLoading && (
        <SrsBanner
          srsDueCount={metrics.srsDueCount}
          currentLevel={currentLevel}
          onDismiss={() => setIsBannerVisible(false)}
          onStartSrs={() => navigate(metrics.dueDecks > 0 ? "/decks?filter=due" : "/decks")}
        />
      )}

      {statsError && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Không tải được số liệu học tập: {statsError}{" "}
          <button type="button" onClick={reloadStats} className="underline font-semibold">
            Thử lại
          </button>
        </p>
      )}

      <LearningKpiGrid
        displayName={displayName}
        currentLevel={currentLevel}
        metrics={metrics}
        loading={statsLoading}
        onOpenEditMetrics={openEditMetrics}
      />

      <RecentDecksSection decks={decks} reviews={reviews} loading={statsLoading} />

      {foldersState.error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {foldersState.error}
        </p>
      )}

      <FolderManagerSection
        folders={folders}
        folderStats={folderStats}
        onOpenCreateModal={() => setCreateFolderOpen(true)}
        onOpenShareModal={setShareTargetFolder}
        onAddDeck={setAddDeckFolder}
        onImportFile={() => setUploadModalOpen(true)}
        onOpenCommunity={() => navigate("/library")}
      />

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

      {/* Thư mục chọn sau, lúc tạo bộ thẻ từ kết quả bóc tách -> không cần truyền folders. */}
      <QuickAiUploadModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
    </div>
  );
};

export default DashboardPage;
