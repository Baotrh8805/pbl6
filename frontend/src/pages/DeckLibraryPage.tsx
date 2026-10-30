import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  LIBRARY_DEFAULTS,
  LIBRARY_MEMORY_KEY,
  LIBRARY_PARAMS,
  libraryParamsToSearch,
  parseLibraryParams,
  type LibraryFilters,
} from "@/features/library/libraryParams";
import { useSearchMemory } from "@/lib/useSearchMemory";

const TOAST_DURATION_MS = 6000;
const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export const DeckLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Bộ lọc nằm trên URL (rà soát 30/10 A2): Back quay lại bộ lọc trước, chia sẻ được link, ?q= từ nơi khác (vd. "Tìm bộ thẻ" ở bản
  // đồ Hán–Việt) vẫn là điểm vào. Rời trang qua sidebar (URL trống) thì khôi phục bộ lọc đã nhớ một lần, như Từ điển.
  const restoring = useSearchMemory(LIBRARY_MEMORY_KEY, LIBRARY_PARAMS);

  const filters = parseLibraryParams(params);
  /** Đổi bộ lọc → về trang đầu (trừ khi đổi chính trang); push để Back quay lại, replace khi chỉ là gõ tìm kiếm. */
  const update = (patch: Partial<LibraryFilters>, replace = false) =>
    setParams(libraryParamsToSearch({ ...filters, page: 0, ...patch }), { replace });

  // Ô tìm gõ mượt bằng state cục bộ, gắn với bộ lọc trên URL lúc gõ (mốc = toàn bộ URL, không chỉ q); ngừng gõ
  // SEARCH_DEBOUNCE_MS thì ghi lên URL bằng replace (không tạo một mục lịch sử cho mỗi lần gõ). Chữ đang gõ còn hiệu lực khi
  // được gõ trên đúng bộ lọc hiện tại, hoặc chính nó vừa được ghi lên URL (trim trùng q) — ô giữ nguyên chữ kể cả khoảng
  // trắng cuối. Back / Forward sang bộ lọc khác → ô hiện q của URL, và không ghi chữ cũ đè lên mục lịch sử đó.
  const filtersKey = libraryParamsToSearch(filters);
  const [typed, setTyped] = useState({ base: filtersKey, value: filters.q });
  const typing = typed.base === filtersKey || typed.value.trim() === filters.q.trim();
  const searchTerm = typing ? typed.value : filters.q;
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (typing && debouncedSearch !== filters.q.trim()) {
      setParams(libraryParamsToSearch({ ...parseLibraryParams(params), q: debouncedSearch, page: 0 }), { replace: true });
    }
  }, [typing, debouncedSearch, filters.q, params, setParams]);
  // Tăng sau khi lưu bộ thẻ -> tải lại để lượt tải cập nhật
  const [reloadKey, setReloadKey] = useState(0);

  const { data, error, loading } = useAsync(
    () =>
      fetchLibrary({
        q: filters.q.trim(),
        level: filters.level,
        category: filters.category,
        tab: filters.tab,
        sort: filters.sort,
        page: filters.page,
        size: PAGE_SIZE,
      }),
    [filters.q.trim(), filters.level, filters.category, filters.tab, filters.sort, filters.page, reloadKey]
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

  const showToast = (toast: { message: string; folderId: string | null }) => {
    setSuccessToast(toast);
    // Toast mới thay toast cũ: huỷ hẹn giờ cũ trước khi đặt lại
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setSuccessToast(null);
    }, TOAST_DURATION_MS);
  };

  const handleSavedToFolder = (folderId: string | null) => {
    setReloadKey((n) => n + 1);
    showToast({ message: "Đã lưu bộ thẻ thành công vào tài khoản của bạn!", folderId });
  };

  // Lưu trùng (vd. đã lưu ở tab khác): tải lại để nút thành "Đã lưu · Mở", báo bằng toast thay cho lỗi đỏ (A4)
  const handleAlreadySaved = () => {
    setReloadKey((n) => n + 1);
    showToast({ message: "Bộ thẻ này đã có trong tài khoản của bạn.", folderId: null });
  };

  // Đặt lại toàn bộ, kể cả sắp xếp (A3: trước đây sắp xếp bị bỏ sót)
  const resetFilters = () => {
    setTyped({ base: "", value: "" });
    setParams(libraryParamsToSearch(LIBRARY_DEFAULTS));
  };
  const page = filters.page;

  const totalPages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;

  if (restoring) return null; // một khung hình, trước khi URL nhận lại bộ lọc đã nhớ: không vẽ Thư viện mặc định rồi nhảy

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

      <LibraryHeader deckCount={view?.allCount ?? null} />

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
        onSearchChange={(value) => setTyped({ base: filtersKey, value })}
        selectedTab={filters.tab}
        onTabChange={(tab) => update({ tab })}
        totalCount={view?.allCount ?? 0}
        selectedLevel={filters.level}
        onLevelChange={(level) => update({ level })}
        sortOption={filters.sort}
        onSortChange={(sort) => update({ sort })}
        selectedCategory={filters.category}
        onCategoryChange={(category) => update({ category })}
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
                onClick={() => update({ page: page - 1 })}
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
                onClick={() => update({ page: page + 1 })}
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
          onAlreadySaved={handleAlreadySaved}
        />
      )}
    </div>
  );
};

export default DeckLibraryPage;
