import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import {
  clearDictHistory,
  fetchDictFavorites,
  fetchDictHistory,
  removeDictFavorite,
  saveDictFavorite,
} from "@/services/dictionaryService";
import { createDeck } from "@/services/deckService";
import type { CardDto } from "@/types/api.types";
import type { DictKey, DictSummary } from "@/types/dictionary.types";
import { headOf, primaryMeaning } from "../dictUtils";
import { ResultRow } from "./WordsTab";

// Sổ tay (mục đã lưu + ghi chú) và lịch sử tra (100 mục gần nhất) kèm tính năng Xuất bộ thẻ học.
export const NotebookTab: React.FC<{ onOpen: (key: DictKey) => void }> = ({ onOpen }) => {
  const dialog = useDialog();
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const favs = useAsync(() => fetchDictFavorites(0, 100), [], reload);
  const history = useAsync(() => fetchDictHistory(100), [], reload);
  const [editing, setEditing] = useState<{ key: DictKey; note: string } | null>(null);
  const [favFilter, setFavFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  const saveNote = async () => {
    if (!editing) return;
    try {
      await saveDictFavorite(editing.key, editing.note.trim() || null);
      setEditing(null);
      setReload((n) => n + 1);
    } catch (e) {
      void dialog.alert({ title: "Không lưu được", message: extractErrorMessage(e) });
    }
  };

  const remove = async (it: DictSummary) => {
    try {
      await removeDictFavorite(it.key);
      setReload((n) => n + 1);
    } catch (e) {
      void dialog.alert({ title: "Không bỏ được", message: extractErrorMessage(e) });
    }
  };

  const clear = async () => {
    const ok = await dialog.confirm({
      title: "Xoá lịch sử tra?",
      message: "Toàn bộ lịch sử tra từ của bạn sẽ bị xoá.",
      confirmLabel: "Xoá",
      tone: "danger",
      action: clearDictHistory,
    });
    if (ok) setReload((n) => n + 1);
  };

  const items = favs.data?.items;
  const filteredFavs = useMemo(() => {
    const list = items ?? [];
    const q = favFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((it) => {
      const head = headOf(it);
      const meaning = primaryMeaning(it)?.text ?? "";
      const note = it.note ?? "";
      return (
        head.main.toLowerCase().includes(q) ||
        (head.reading && head.reading.toLowerCase().includes(q)) ||
        meaning.toLowerCase().includes(q) ||
        note.toLowerCase().includes(q)
      );
    });
  }, [items, favFilter]);
  const rawFavs = items ?? [];

  const handleExportToDeck = async () => {
    if (rawFavs.length === 0) return;
    const ok = await dialog.confirm({
      title: "Tạo bộ thẻ ôn tập?",
      message: `Hệ thống sẽ tạo một bộ thẻ mới chứa ${rawFavs.length} từ vựng từ Sổ tay của bạn để ôn tập Flashcard và Spaced Repetition.`,
      confirmLabel: "Tạo bộ thẻ ngay",
    });
    if (!ok) return;

    setExporting(true);
    try {
      const cards: CardDto[] = rawFavs.map((it) => {
        const head = headOf(it);
        const meaning = primaryMeaning(it)?.text || it.meaningVi || it.glossShort || "";
        const notePart = it.note ? `\n(Ghi chú: ${it.note})` : "";
        return {
          term: head.main,
          reading: head.reading ?? undefined,
          meaning: `${meaning}${notePart}`.trim(),
        };
      });

      const todayStr = new Date().toLocaleDateString("vi-VN");
      const newDeck = await createDeck({
        title: `Sổ tay từ vựng (${todayStr})`,
        level: "N5",
        description: `Tập hợp ${cards.length} mục từ đã lưu từ Sổ tay Từ điển NihonGen ngày ${todayStr}.`,
        cards,
      });

      void dialog.alert({
        title: "Tạo bộ thẻ thành công!",
        message: `Bộ thẻ «${newDeck.title}» với ${cards.length} thẻ đã được thêm vào tài khoản của bạn. Bấm OK để mở bộ thẻ học ngay.`,
      }).then(() => {
        navigate(`/decks/${newDeck.id}`);
      });
    } catch (err) {
      void dialog.alert({ title: "Lỗi tạo bộ thẻ", message: extractErrorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Cột 1: Sổ tay cá nhân */}
      <section aria-labelledby="nb-favs" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-surface-container-high/40">
          <div className="flex items-center gap-2">
            <h2 id="nb-favs" className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-1.5">
              <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-primary">bookmarks</span>
              Sổ tay {favs.data && <span className="text-on-surface-variant font-normal text-sm">({favs.data.total})</span>}
            </h2>
          </div>
          {rawFavs.length > 0 && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportToDeck}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">style</span>
              {exporting ? "Đang tạo bộ thẻ..." : "Tạo bộ thẻ ôn tập"}
            </button>
          )}
        </div>

        {rawFavs.length > 3 && (
          <div className="relative">
            <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              value={favFilter}
              onChange={(e) => setFavFilter(e.target.value)}
              placeholder="Lọc từ trong sổ tay theo chữ, cách đọc hoặc ghi chú..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface placeholder:text-outline border border-surface-container-high/50 focus:outline-none focus:border-primary transition-colors"
            />
            {favFilter && (
              <button
                type="button"
                onClick={() => setFavFilter("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-xs"
              >
                ×
              </button>
            )}
          </div>
        )}

        {favs.error && <p role="alert" className="text-body-sm text-error">{favs.error}</p>}
        {favs.data && rawFavs.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">
              bookmark_border
            </span>
            <p className="font-semibold text-on-surface text-sm">Chưa có từ vựng nào trong sổ tay</p>
            <p className="text-body-sm text-on-surface-variant max-w-xs text-xs">
              Khi tra từ điển, bấm nút "Lưu sổ tay" ở góc trên bên phải mục từ để lưu lại và tạo bộ thẻ ôn tập sau này.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {filteredFavs.map((it) => (
            <li key={it.key} className="rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-2xs hover:border-primary/40 transition-colors">
              <ResultRow item={it} onClick={() => onOpen(it.key)} />
              <div className="px-3.5 pb-2.5 pt-1 border-t border-surface-container-high/30 flex flex-col gap-1.5">
                {editing?.key === it.key ? (
                  <div className="flex gap-2 items-center">
                    <input
                      aria-label="Ghi chú cá nhân"
                      value={editing.note}
                      maxLength={300}
                      onChange={(e) => setEditing({ key: it.key, note: e.target.value })}
                      placeholder="Ghi chú cách nhớ của riêng bạn..."
                      className="flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1 text-xs focus:outline-none focus:border-primary"
                    />
                    <Button size="sm" onClick={() => void saveNote()}>Lưu</Button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="text-xs text-on-surface-variant hover:text-on-surface px-1 cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  it.note && (
                    <p className="text-xs text-on-surface-variant bg-surface-container-low/70 px-2 py-1 rounded-md">
                      <span className="font-medium text-primary">📝 Ghi chú:</span> {it.note}
                    </p>
                  )
                )}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <button
                    type="button"
                    onClick={() => setEditing({ key: it.key, note: it.note ?? "" })}
                    className="text-primary hover:underline cursor-pointer font-medium"
                  >
                    {it.note ? "Sửa ghi chú" : "+ Thêm ghi chú nhớ từ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(it)}
                    className="text-error/80 hover:text-error hover:underline cursor-pointer"
                  >
                    Bỏ khỏi sổ tay
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Cột 2: Lịch sử tra cứu gần đây */}
      <section aria-labelledby="nb-history" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-surface-container-high/40">
          <h2 id="nb-history" className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-1.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-primary">history</span>
            Lịch sử tra cứu
          </h2>
          {(history.data?.length ?? 0) > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void clear()}>
              Xoá lịch sử
            </Button>
          )}
        </div>
        {history.error && <p role="alert" className="text-body-sm text-error">{history.error}</p>}
        {history.data && history.data.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[36px] text-outline">
              manage_search
            </span>
            <p className="font-semibold text-on-surface text-sm">Chưa có lịch sử tra từ</p>
            <p className="text-body-sm text-on-surface-variant max-w-xs text-xs">
              Các từ vựng bạn tra cứu sẽ tự động được ghi nhớ ở đây để bạn dễ dàng ôn lại.
            </p>
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {(history.data ?? []).map((it) => (
            <li key={it.key}>
              <ResultRow item={it} onClick={() => onOpen(it.key)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
