import React, { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { fetchDecks, deleteDeck, moveDeckToFolder } from "@/services/deckService";
import { fetchFolders, createFolder, updateFolder } from "@/services/folderService";
import { moveTargets, JLPT_LEVELS as LEVELS, calcDeckProgress } from "@/lib/deckUtils";
import type { Deck, FolderNode, FolderDto } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { FolderModal } from "@/features/decks/components/DeckModals";
import { AddExistingDeckModal } from "@/features/decks/components/AddExistingDeckModal";
import { DeckCard, DeckCardSkeleton } from "@/features/decks/components/DeckCard";
import { DECK_PERIODS, DECK_SORTS, dueByDeck, filterDecks, isDeckPeriod, isDeckSort, sortDecks } from "@/features/decks/deckListUtils";
import { useShell } from "@/components/layout/shellContext";
import { useDialog } from "@/components/ui/dialogContext";
import { findFolder, flattenFolders, getBreadcrumbs } from "@/features/folders/components/folderTree";

type PresetFilter = "all" | "due" | "in_progress" | "completed";

export const DecksPage: React.FC = () => {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  const level = params.get("level") ?? "";
  const q = params.get("q") ?? "";
  const folderId = params.get("folderId") ?? "";
  const sortParam = params.get("sort");
  const sort = isDeckSort(sortParam) ? sortParam : "updated";
  const periodParam = params.get("period") ?? "";
  const period = isDeckPeriod(periodParam) ? periodParam : "";
  const dueOnly = params.get("filter") === "due";
  const { reviews } = useShell();

  const [refreshIndex, setRefreshIndex] = useState(0);
  const { data: decksData, error: decksError, loading: decksLoading } = useAsync(
    () => fetchDecks(folderId || null),
    [folderId, refreshIndex]
  );
  const { data: folderTree } = useAsync(fetchFolders, [refreshIndex]);

  // Modal state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderNode | null>(null);
  const [isAddExistingModalOpen, setIsAddExistingModalOpen] = useState(false);
  const [folderForAddExisting, setFolderForAddExisting] = useState<{ id: string; title: string } | null>(null);

  const tree = useMemo(() => folderTree || [], [folderTree]);
  const flatFolders = useMemo(() => flattenFolders(tree), [tree]);
  const currentFolder = folderId ? findFolder(tree, folderId) : null;
  const breadcrumbs = folderId ? getBreadcrumbs(tree, folderId) : [];

  const dueMap = useMemo(() => dueByDeck(decksData ?? [], reviews), [decksData, reviews]);
  const dueDeckCount = Object.values(dueMap).filter((n) => n > 0).length;

  // Tiến độ từng bộ thẻ
  const progressMap = useMemo(() => {
    const map = new Map<string, { inProgress: boolean; completed: boolean }>();
    const now = new Date();
    for (const d of decksData ?? []) {
      const p = calcDeckProgress(d.cards, reviews, now);
      const completed = p.total > 0 && p.mastered === p.total;
      const inProgress = p.total > 0 && !completed && (p.newCards < p.total || p.due > 0 || p.mastered > 0);
      map.set(d.id, { inProgress, completed });
    }
    return map;
  }, [decksData, reviews]);

  // Bộ lọc Preset Filter
  const [preset, setPreset] = useState<PresetFilter>(dueOnly ? "due" : "all");

  const filteredDecks = useMemo(() => {
    let list = filterDecks(decksData ?? [], { q, level, period, dueOnly: preset === "due" }, dueMap);
    if (preset === "in_progress") {
      list = list.filter((d) => progressMap.get(d.id)?.inProgress);
    } else if (preset === "completed") {
      list = list.filter((d) => progressMap.get(d.id)?.completed);
    }
    return sortDecks(list, sort);
  }, [decksData, q, level, period, preset, dueMap, progressMap, sort]);

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const handleSaveFolder = async (dto: FolderDto) => {
    if (editingFolder) await updateFolder(editingFolder.id, dto);
    else await createFolder(dto);
    setRefreshIndex((n) => n + 1);
  };

  const handleDeleteDeck = async (deck: Deck) => {
    const ok = await dialog.confirm({
      title: "Xoá bộ thẻ?",
      message: `Bộ thẻ "${deck.title}" và toàn bộ thẻ từ vựng bên trong sẽ bị xoá vĩnh viễn.`,
      confirmLabel: "Xoá bộ thẻ",
      tone: "danger",
      action: () => deleteDeck(deck.id),
    });
    if (ok) setRefreshIndex((n) => n + 1);
  };

  const handleRemoveFromFolder = async (deck: Deck, folder: FolderNode) => {
    const ok = await dialog.confirm({
      title: "Đưa bộ thẻ ra khỏi thư mục?",
      message: `Bộ thẻ "${deck.title}" sẽ được chuyển từ thư mục "${folder.title}" về danh sách ngoài cùng.`,
      confirmLabel: "Chuyển ra ngoài",
      tone: "warning",
      action: () => moveDeckToFolder(deck, null),
    });
    if (ok) setRefreshIndex((n) => n + 1);
  };

  return (
    <section className="flex flex-col gap-6 pb-12">
      {/* 1. Header: Tiêu đề trang & Các nút hành động chính */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {currentFolder ? currentFolder.title : "Bộ thẻ của tôi"}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredDecks.length} bộ thẻ
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {currentFolder
              ? currentFolder.description || "Quản lý và ôn tập các bộ thẻ trong thư mục này"
              : "Kho từ vựng & Kanji cá nhân theo phương pháp lặp lại ngắt quãng (SRS)"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lối tắt sang Không gian Thư mục chuyên sâu */}
          <Link
            to="/folders"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
            title="Mở toàn bộ cây thư mục và không gian học tập"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-blue-600">
              folder
            </span>
            <span>Không gian Thư mục</span>
          </Link>

          {currentFolder && (
            <button
              type="button"
              onClick={() => {
                setFolderForAddExisting({ id: currentFolder.id, title: currentFolder.title });
                setIsAddExistingModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                playlist_add
              </span>
              <span>Thêm thẻ có sẵn</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              navigate(folderId ? `/decks/new?folderId=${encodeURIComponent(folderId)}` : "/decks/new")
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              add
            </span>
            <span>Tạo bộ thẻ mới</span>
          </button>

          <Link
            to="/library"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              public
            </span>
            <span>Thư viện</span>
          </Link>
        </div>
      </div>

      {/* 2. Đường dẫn Breadcrumb khi đang lọc theo Thư mục */}
      {currentFolder && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs">
          <nav aria-label="Đường dẫn thư mục" className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setParam("folderId", "")}
              className="font-medium text-slate-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Tất cả bộ thẻ
            </button>
            {breadcrumbs.map((bc, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={bc.id}>
                  <span className="text-slate-400">/</span>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => setParam("folderId", bc.id)}
                    className={isLast ? "font-bold text-blue-900" : "font-medium text-slate-600 hover:text-blue-700"}
                  >
                    {bc.title}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingFolder(currentFolder);
                setIsFolderModalOpen(true);
              }}
              className="text-xs font-semibold text-slate-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                edit
              </span>
              <span>Đổi tên</span>
            </button>
            <button
              type="button"
              onClick={() => setParam("folderId", "")}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                close
              </span>
              <span>Xem tất cả</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Thanh Toolbar: Preset Chips & Bộ lọc kết hợp */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col gap-3.5">
        {/* Hàng 1: Preset Chips lọc nhanh */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div role="group" aria-label="Bộ lọc nhanh" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={preset === "all"}
              onClick={() => {
                setPreset("all");
                setParam("filter", "");
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                preset === "all"
                  ? "bg-slate-900 text-white shadow-xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              Tất cả ({decksData?.length ?? 0})
            </button>

            <button
              type="button"
              aria-pressed={preset === "due"}
              onClick={() => {
                setPreset("due");
                setParam("filter", "due");
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                preset === "due"
                  ? "bg-amber-400 text-slate-950 shadow-xs font-bold"
                  : "bg-amber-50 text-amber-800 border border-amber-200/70 hover:bg-amber-100"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                event_repeat
              </span>
              <span>Cần ôn ngay ({dueDeckCount})</span>
            </button>

            <button
              type="button"
              aria-pressed={preset === "in_progress"}
              onClick={() => {
                setPreset("in_progress");
                setParam("filter", "");
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                preset === "in_progress"
                  ? "bg-blue-600 text-white shadow-xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                play_circle
              </span>
              <span>Đang học</span>
            </button>

            <button
              type="button"
              aria-pressed={preset === "completed"}
              onClick={() => {
                setPreset("completed");
                setParam("filter", "");
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                preset === "completed"
                  ? "bg-emerald-600 text-white shadow-xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                verified
              </span>
              <span>Đã thuộc hết</span>
            </button>
          </div>

          {/* Chọn nhanh Thư mục qua Dropdown thay vì chiếm diện tích */}
          {flatFolders.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-400">
                folder_open
              </span>
              <label htmlFor="folder-select" className="sr-only">
                Lọc theo thư mục
              </label>
              <select
                id="folder-select"
                value={folderId}
                onChange={(e) => setParam("folderId", e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px] truncate"
              >
                <option value="">Thư mục: Tất cả</option>
                {flatFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {"\u00A0".repeat(f.depth * 2)}📁 {f.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Hàng 2: Tìm kiếm & Các dropdown tiêu chí */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-2.5"
            >
              search
            </span>
            <label className="sr-only" htmlFor="deck-search">
              Tìm kiếm bộ thẻ
            </label>
            <input
              id="deck-search"
              type="text"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Tìm theo tên bộ thẻ, mô tả, từ vựng..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="deck-level">
              Lọc theo trình độ JLPT
            </label>
            <select
              id="deck-level"
              value={level}
              onChange={(e) => setParam("level", e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Mọi trình độ (N5 - N1)</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  JLPT {l}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="deck-period">
              Lọc theo thời gian
            </label>
            <select
              id="deck-period"
              value={period}
              onChange={(e) => setParam("period", e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DECK_PERIODS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="deck-sort">
              Sắp xếp
            </label>
            <select
              id="deck-sort"
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "updated" ? "" : e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DECK_SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  Xếp: {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Trạng thái tải & Thông báo lỗi */}
      <div aria-live="polite">
        {decksLoading && (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Đang tải danh sách bộ thẻ">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <DeckCardSkeleton key={i} />
            ))}
          </ul>
        )}

        {decksError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between"
          >
            <span>{decksError}</span>
            <button
              type="button"
              onClick={() => setRefreshIndex((n) => n + 1)}
              className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-rose-700 text-xs font-semibold hover:bg-rose-100"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Empty state: Thân thiện, có lời kêu gọi hành động */}
        {!decksLoading && !decksError && filteredDecks.length === 0 && (
          <div className="p-10 text-center rounded-2xl bg-white border border-dashed border-slate-300 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <span aria-hidden="true" className="material-symbols-outlined text-[28px]">
                style
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {preset === "due"
                ? "Tuyệt vời! Không có bộ thẻ nào cần ôn tập vào lúc này."
                : currentFolder
                ? `Thư mục "${currentFolder.title}" chưa có bộ thẻ nào.`
                : "Không tìm thấy bộ thẻ nào phù hợp với bộ lọc."}
            </p>
            <p className="text-xs text-slate-500 max-w-sm">
              {preset === "due"
                ? "Tất cả các thẻ đến hạn đã được hoàn thành. Bạn có thể chọn 'Tất cả' để tiếp tục học thẻ mới."
                : "Tạo một bộ thẻ mới hoặc tải tài liệu lên để hệ thống AI tự động bóc tách từ vựng cho bạn."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => navigate("/decks/new")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  add
                </span>
                <span>Tạo bộ thẻ mới</span>
              </button>
              <Link
                to="/extractions"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/80 text-xs font-bold transition-colors"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  document_scanner
                </span>
                <span>Bóc tách tài liệu AI</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 5. Lưới danh sách bộ thẻ (3 cột chuẩn) */}
      {!decksLoading && filteredDecks.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              dueCount={dueMap[deck.id] ?? 0}
              inFolder={!!currentFolder}
              onDelete={(d) => void handleDeleteDeck(d)}
              onRemoveFromFolder={currentFolder ? (d) => void handleRemoveFromFolder(d, currentFolder) : undefined}
            />
          ))}
        </ul>
      )}

      {/* Folder Modal */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        parentFolder={currentFolder}
        folder={editingFolder}
        moveTargets={editingFolder ? moveTargets(tree, editingFolder.id) : []}
        onSave={handleSaveFolder}
      />

      {/* Add Existing Deck Modal */}
      {folderForAddExisting && (
        <AddExistingDeckModal
          isOpen={isAddExistingModalOpen}
          onClose={() => {
            setIsAddExistingModalOpen(false);
            setFolderForAddExisting(null);
          }}
          targetFolder={folderForAddExisting}
          onSuccess={() => setRefreshIndex((n) => n + 1)}
        />
      )}
    </section>
  );
};

export default DecksPage;
