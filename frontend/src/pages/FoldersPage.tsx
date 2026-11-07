import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchDecks, deleteDeck, moveDeckToFolder } from "@/services/deckService";
import {
  fetchFolders,
  fetchFolder,
  fetchSharedFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from "@/services/folderService";
import { moveTargets } from "@/lib/deckUtils";
import type { FolderNode, Deck, FolderDto } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { useDialog, type ConfirmOptions } from "@/components/ui/dialogContext";
import { FolderModal } from "@/features/decks/components/DeckModals";
import { AddExistingDeckModal } from "@/features/decks/components/AddExistingDeckModal";
import { ShareFolderModal } from "@/features/folders/components/ShareFolderModal";
import { FoldersRootHeader } from "@/features/folders/components/FoldersRootHeader";
import { FolderDetailHeader } from "@/features/folders/components/FolderDetailHeader";
import { FolderFilterBar } from "@/features/folders/components/FolderFilterBar";
import { FolderGrid, FoldersEmptyState } from "@/features/folders/components/FolderGrid";
import { FolderCardSkeleton } from "@/features/folders/components/FolderCard";
import { FolderDeckList } from "@/features/folders/components/FolderDeckList";
import {
  computeFolderMetrics,
  findFolder,
  getBreadcrumbs,
  matchesFilter,
} from "@/features/folders/components/folderTree";

type FolderRef = { id: string; title: string; accessType?: string | null };

export const FoldersPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const dialog = useDialog();
  const folderId = params.get("folderId") ?? "";
  const levelParam = params.get("level") ?? "";
  const qParam = params.get("q") ?? "";

  // Tăng để tải lại dữ liệu
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refresh = () => setRefreshIndex((n) => n + 1);

  const { data: folderTree, loading: foldersLoading, error: foldersError } = useAsync(
    fetchFolders,
    [refreshIndex]
  );
  const { data: sharedFolders } = useAsync(fetchSharedFolders, [refreshIndex]);

  const tree = useMemo(() => folderTree || [], [folderTree]);
  const ownFolder = useMemo(() => (folderId ? findFolder(tree, folderId) : null), [tree, folderId]);
  // Không nằm trong cây của mình -> thư mục được chia sẻ / public (mở từ link): tải riêng, server kiểm quyền
  const foreignId = folderId && !foldersLoading && !ownFolder ? folderId : "";
  const foreign = useAsync(
    () => (foreignId ? fetchFolder(foreignId) : Promise.resolve(null)),
    [foreignId, refreshIndex]
  );

  // Thư mục của mình: tải mọi bộ thẻ cá nhân 1 lần (đủ để đếm cho cả thư mục con).
  // Thư mục được chia sẻ: server trả bộ thẻ của cả cây con (để đếm số liệu thư mục con).
  const { data: allDecksData, loading: decksLoading, error: decksError } = useAsync(
    () => fetchDecks(foreignId || null),
    [foreignId, refreshIndex]
  );

  // Trạng thái modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderNode | null>(null);
  const [parentFolderForCreate, setParentFolderForCreate] = useState<FolderNode | null>(null);
  const [shareModalFolder, setShareModalFolder] = useState<FolderRef | null>(null);
  const [addExistingFolder, setAddExistingFolder] = useState<FolderRef | null>(null);

  const currentFolder = ownFolder ?? foreign.data ?? null;
  const readOnly = currentFolder?.access === "viewer";
  const breadcrumbs = useMemo(
    () => (ownFolder ? getBreadcrumbs(tree, ownFolder.id) : foreign.data ? [foreign.data] : []),
    [tree, ownFolder, foreign.data]
  );
  const subfolders = useMemo(
    () => (currentFolder ? currentFolder.children || [] : tree),
    [currentFolder, tree]
  );

  const [tab, setTab] = useState<"all" | "mine" | "shared">("all");

  // Ghi tham số lọc lên URL
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const folderMetrics = useMemo(() => computeFolderMetrics(allDecksData), [allDecksData]);

  const filteredSubfolders = useMemo(
    () => subfolders.filter((f) => matchesFilter(f, qParam, levelParam)),
    [subfolders, qParam, levelParam]
  );
  const currentFolderDecks = useMemo(() => {
    if (!currentFolder || !allDecksData) return [];
    return allDecksData.filter(
      (d) => d.folderId === currentFolder.id && matchesFilter(d, qParam, levelParam)
    );
  }, [currentFolder, allDecksData, qParam, levelParam]);

  // Tổng số liệu cho header trang gốc
  const totalOrganizedDecks = Object.values(folderMetrics).reduce((acc, cur) => acc + cur.decks, 0);
  const totalOrganizedCards = Object.values(folderMetrics).reduce((acc, cur) => acc + cur.cards, 0);

  // Thao tác thư mục
  const openFolder = (id: string) => setParam("folderId", id);
  const openShare = (f: FolderRef) => setShareModalFolder({ id: f.id, title: f.title, accessType: f.accessType });
  const openAddExisting = (f: FolderRef) => setAddExistingFolder({ id: f.id, title: f.title });

  const handleOpenCreateFolder = (parent: FolderNode | null = null) => {
    setEditingFolder(null);
    setParentFolderForCreate(parent);
    setIsFolderModalOpen(true);
  };

  const handleEditFolder = (folder: FolderNode) => {
    setParentFolderForCreate(null);
    setEditingFolder(folder);
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = async (dto: FolderDto) => {
    if (editingFolder) await updateFolder(editingFolder.id, dto);
    else await createFolder(dto);
    refresh();
  };

  // Hỏi xác nhận -> chạy thao tác ngay trong hộp thoại (lỗi hiện tại chỗ) -> thành công thì tải lại.
  const runConfirmed = async (options: ConfirmOptions) => {
    if (await dialog.confirm({ tone: "danger", ...options })) refresh();
  };

  const handleDeleteFolder = (folder: FolderNode) =>
    runConfirmed({
      title: "Xoá thư mục?",
      message: `Thư mục "${folder.title}" sẽ bị xoá.
Thư mục con và các bộ thẻ bên trong sẽ được chuyển ra ngoài cùng, không bị xoá.`,
      confirmLabel: "Xoá thư mục",
      action: async () => {
        await deleteFolder(folder.id);
        if (folderId === folder.id) setParam("folderId", folder.parentId ?? "");
      },
    });

  const handleDeleteDeck = (deck: Deck) =>
    runConfirmed({
      title: "Xoá bộ thẻ?",
      message: `Bộ thẻ "${deck.title}" và toàn bộ flashcard bên trong sẽ bị xoá vĩnh viễn.`,
      confirmLabel: "Xoá bộ thẻ",
      action: () => deleteDeck(deck.id),
    });

  const handleRemoveDeckFromFolder = (deck: Deck) =>
    runConfirmed({
      title: "Đưa bộ thẻ ra khỏi thư mục?",
      message: `Bộ thẻ "${deck.title}" sẽ được chuyển từ thư mục "${currentFolder?.title}" về danh sách ngoài cùng.`,
      confirmLabel: "Chuyển ra ngoài",
      tone: "warning",
      action: () => moveDeckToFolder(deck, null),
    });

  const error = foldersError || foreign.error || decksError;

  return (
    <div className="flex flex-col w-full gap-6 pb-12">
      {!currentFolder ? (
        <FoldersRootHeader
          foldersCount={tree.length}
          decksCount={totalOrganizedDecks}
          cardsCount={totalOrganizedCards}
          onCreateFolder={() => handleOpenCreateFolder(null)}
        />
      ) : (
        <FolderDetailHeader
          folder={currentFolder}
          breadcrumbs={breadcrumbs}
          decksCount={currentFolderDecks.length}
          subfoldersCount={subfolders.length}
          onNavigate={openFolder}
          onAddExistingDeck={openAddExisting}
          onShare={openShare}
          onCreateSubfolder={handleOpenCreateFolder}
          onEdit={handleEditFolder}
        />
      )}

      <FolderFilterBar
        query={qParam}
        level={levelParam}
        placeholder={
          currentFolder
            ? `Tìm bộ thẻ trong "${currentFolder.title}"...`
            : "Tìm kiếm thư mục, giáo trình, bộ thẻ từ vựng..."
        }
        onQueryChange={(q) => setParam("q", q)}
        onLevelChange={(lvl) => setParam("level", lvl)}
      />

      {/* Tabs phân biệt Thư mục của tôi / Được chia sẻ khi ở màn hình gốc */}
      {!currentFolder && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-2">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tab === "all"
                ? "bg-slate-900 text-white shadow-xs font-bold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              folder_special
            </span>
            <span>Tất cả ({tree.length + (sharedFolders?.length ?? 0)})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tab === "mine"
                ? "bg-blue-600 text-white shadow-xs font-bold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              folder
            </span>
            <span>Thư mục của tôi ({tree.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("shared")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              tab === "shared"
                ? "bg-emerald-600 text-white shadow-xs font-bold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              folder_shared
            </span>
            <span>Được chia sẻ với tôi ({sharedFolders?.length ?? 0})</span>
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            error
          </span>
          <span>{error}</span>
        </div>
      )}

      {foldersLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Đang tải danh sách thư mục">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <FolderCardSkeleton key={i} />
          ))}
        </div>
      )}

      {(currentFolder || tab === "all" || tab === "mine") &&
        filteredSubfolders.length > 0 &&
        (readOnly ? (
          <FolderGrid folders={filteredSubfolders} metrics={folderMetrics} isNested onOpen={(f) => openFolder(f.id)} />
        ) : (
          <FolderGrid
            folders={filteredSubfolders}
            metrics={folderMetrics}
            isNested={!!currentFolder}
            onAddFolder={() => handleOpenCreateFolder(currentFolder)}
            onOpen={(f) => openFolder(f.id)}
            onAddDeck={openAddExisting}
            onShare={openShare}
            onEdit={handleEditFolder}
            onDelete={handleDeleteFolder}
          />
        ))}

      {currentFolder && (
        <FolderDeckList
          folder={currentFolder}
          decks={currentFolderDecks}
          loading={decksLoading}
          onAddExistingDeck={openAddExisting}
          onRemoveFromFolder={handleRemoveDeckFromFolder}
          onDeleteDeck={handleDeleteDeck}
        />
      )}

      {!currentFolder && !foldersLoading && filteredSubfolders.length === 0 && (
        <FoldersEmptyState
          isFiltered={!!(qParam || levelParam)}
          onCreate={() => handleOpenCreateFolder(null)}
        />
      )}

      {/* Thư mục người khác chia sẻ cho mình: chỉ xem & học */}
      {!folderId && (tab === "all" || tab === "shared") && sharedFolders && sharedFolders.length > 0 && (
        <FolderGrid
          title={tab === "shared" ? undefined : "Được chia sẻ với tôi"}
          folders={sharedFolders.filter((f) => matchesFilter(f, qParam, levelParam))}
          metrics={{}}
          isNested={false}
          onOpen={(f) => openFolder(f.id)}
        />
      )}

      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        parentFolder={parentFolderForCreate}
        folder={editingFolder}
        moveTargets={editingFolder ? moveTargets(tree, editingFolder.id) : []}
        onSave={handleSaveFolder}
      />

      <ShareFolderModal
        isOpen={!!shareModalFolder}
        onClose={() => setShareModalFolder(null)}
        folder={shareModalFolder}
        onChanged={refresh}
      />

      {addExistingFolder && (
        <AddExistingDeckModal
          isOpen={!!addExistingFolder}
          onClose={() => setAddExistingFolder(null)}
          targetFolder={addExistingFolder}
          onSuccess={refresh}
        />
      )}
    </div>
  );
};

export default FoldersPage;
