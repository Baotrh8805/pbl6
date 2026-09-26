import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LibraryDeck, LibraryPage, LibraryRating } from "@/types/api.types";
import { fetchLibrary } from "@/services/libraryService";
import { useAsync } from "@/lib/useAsync";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SaveToFolderModal } from "@/features/decks/components/SaveToFolderModal";
import { LibraryHeader, SaveSuccessToast } from "@/features/library/components/LibraryHeader";
import { FeaturedDeckHero } from "@/features/library/components/FeaturedDeckHero";
import { LibraryFilterBar } from "@/features/library/components/LibraryFilterBar";
import { LibraryDeckGrid } from "@/features/library/components/LibraryDeckGrid";
import { LibraryPreviewModal } from "@/features/library/components/LibraryPreviewModal";
import type { LibraryTab, SortOption } from "@/features/library/components/libraryOptions";

const TOAST_DURATION_MS = 6000;
const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export const DeckLibraryPage: React.FC = () => {
  const navigate = useNavigate();

  // Tìm kiếm & bộ lọc: gửi lên server. Ô tìm kiếm chờ ngừng gõ rồi mới gọi API.
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_MS);
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTab, setSelectedTab] = useState<LibraryTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("downloads");
  const [page, setPage] = useState(0);
  // Tăng sau khi lưu bộ thẻ -> tải lại để lượt tải cập nhật
  const [reloadKey, setReloadKey] = useState(0);

  const { data, error, loading } = useAsync(
    () =>
      fetchLibrary({
        q: debouncedSearch,
        level: selectedLevel,
        category: selectedCategory,
        tab: selectedTab,
        sort: sortOption,
        page,
        size: PAGE_SIZE,
      }),
    [debouncedSearch, selectedLevel, selectedCategory, selectedTab, sortOption, page, reloadKey]
  );
  // Giữ kết quả trước trong lúc tải kết quả mới: đổi bộ lọc không làm banner/lưới nhấp nháy.
  // (setState trong render = mẫu "lưu giá trị từ lần render trước" của React, không cần effect)
  const [lastPage, setLastPage] = useState<LibraryPage | undefined>();
  if (data && data !== lastPage) setLastPage(data);
  const view = data ?? lastPage;

  // Kết quả chấm sao áp lên dữ liệu đang hiển thị, không cần tải lại cả trang
  const [ratings, setRatings] = useState<Record<string, LibraryRating>>({});
  const withRating = (deck: LibraryDeck): LibraryDeck => ({ ...deck, ...ratings[deck.id] });

  // Modal & toast
  const [previewDeck, setPreviewDeck] = useState<LibraryDeck | null>(null);
  const [savingDeck, setSavingDeck] = useState<LibraryDeck | null>(null);
  const [successToast, setSuccessToast] = useState<{
    message: string;
    folderId?: string | null;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Huỷ hẹn giờ ẩn toast khi rời trang
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  // Đổi bộ lọc -> về trang đầu
  const filterSetter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };

  const handleSavedToFolder = (folderId: string | null) => {
    setReloadKey((n) => n + 1);
    setSuccessToast({
      message: "Đã lưu bộ thẻ thành công vào tài khoản của bạn!",
      folderId,
    });
    // Toast mới thay toast cũ: huỷ hẹn giờ cũ trước khi đặt lại
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setSuccessToast(null);
    }, TOAST_DURATION_MS);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedLevel("");
    setSelectedCategory("all");
    setSelectedTab("all");
    setPage(0);
  };

  const totalPages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col w-full gap-space-lg pb-space-xl">
      {successToast && (
        <SaveSuccessToast
          message={successToast.message}
          onOpenDecks={() =>
            navigate(
              successToast.folderId
                ? `/decks?folderId=${encodeURIComponent(successToast.folderId)}`
                : "/decks"
            )
          }
        />
      )}

      <LibraryHeader />

      {view?.featured && (
        <FeaturedDeckHero
          deck={withRating(view.featured.deck)}
          sampleCard={view.featured.sampleCard}
          onPreview={setPreviewDeck}
          onSave={setSavingDeck}
        />
      )}

      <LibraryFilterBar
        searchTerm={searchTerm}
        onSearchChange={filterSetter(setSearchTerm)}
        selectedTab={selectedTab}
        onTabChange={filterSetter(setSelectedTab)}
        totalCount={view?.allCount ?? 0}
        selectedLevel={selectedLevel}
        onLevelChange={filterSetter(setSelectedLevel)}
        sortOption={sortOption}
        onSortChange={filterSetter(setSortOption)}
        selectedCategory={selectedCategory}
        onCategoryChange={filterSetter(setSelectedCategory)}
      />

      {error ? (
        <div
          role="alert"
          className="p-8 rounded-2xl bg-error/10 border border-error/20 flex flex-col items-center gap-3 text-center"
        >
          <p className="text-error font-semibold">Không tải được Thư viện: {error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((n) => n + 1)}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container"
          >
            Thử lại
          </button>
        </div>
      ) : !view ? (
        <p className="p-12 text-center text-on-surface-variant" aria-live="polite">
          Đang tải bộ thẻ...
        </p>
      ) : (
        <div aria-busy={loading} className={`flex flex-col gap-space-lg transition-opacity ${loading ? "opacity-60" : ""}`}>
          <LibraryDeckGrid
            decks={view.items.map(withRating)}
            total={view.total}
            onPreview={setPreviewDeck}
            onSave={setSavingDeck}
            onResetFilters={resetFilters}
          />
          {totalPages > 1 && (
            <nav aria-label="Phân trang" className="flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                ← Trang trước
              </button>
              <span className="text-on-surface-variant">
                Trang {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Trang sau →
              </button>
            </nav>
          )}
        </div>
      )}

      {previewDeck && (
        <LibraryPreviewModal
          deck={withRating(previewDeck)}
          onClose={() => setPreviewDeck(null)}
          onSave={setSavingDeck}
          onRated={(id, rating) => setRatings((prev) => ({ ...prev, [id]: rating }))}
        />
      )}

      {savingDeck && (
        <SaveToFolderModal
          isOpen={!!savingDeck}
          onClose={() => setSavingDeck(null)}
          deck={savingDeck}
          onSaved={handleSavedToFolder}
        />
      )}
    </div>
  );
};

export default DeckLibraryPage;
