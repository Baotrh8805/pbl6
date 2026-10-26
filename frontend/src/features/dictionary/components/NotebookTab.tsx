import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";
import { clearDictHistory, fetchDictFavorites, fetchDictHistory, removeDictFavorite, saveDictFavorite } from "@/services/dictionaryService";
import type { DictKey, DictSummary } from "@/types/dictionary.types";
import { ResultRow } from "./WordsTab";

// Sổ tay (mục đã lưu + ghi chú) và lịch sử tra (100 mục gần nhất, D25).
export const NotebookTab: React.FC<{ onOpen: (key: DictKey) => void }> = ({ onOpen }) => {
  const dialog = useDialog();
  const [reload, setReload] = useState(0);
  const favs = useAsync(() => fetchDictFavorites(0, 50), [], reload);
  const history = useAsync(() => fetchDictHistory(100), [], reload);
  const [editing, setEditing] = useState<{ key: DictKey; note: string } | null>(null);

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
    const ok = await dialog.confirm({ title: "Xoá lịch sử tra?", message: "Toàn bộ lịch sử tra từ của bạn sẽ bị xoá.", confirmLabel: "Xoá", tone: "danger", action: clearDictHistory });
    if (ok) setReload((n) => n + 1);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="nb-favs" className="flex flex-col gap-2">
        <h2 id="nb-favs" className="font-semibold text-on-surface flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">bookmarks</span>
          Sổ tay {favs.data && <span className="text-on-surface-variant font-normal">({favs.data.total})</span>}
        </h2>
        {favs.error && <p role="alert" className="text-body-sm text-error">{favs.error}</p>}
        {favs.data && favs.data.items.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">Chưa lưu mục nào. Bấm "Lưu sổ tay" ở một mục từ để lưu lại.</p>
        )}
        <ul className="flex flex-col gap-1">
          {(favs.data?.items ?? []).map((it) => (
            <li key={it.key} className="rounded-lg border border-surface-container-high">
              <ResultRow item={it} onClick={() => onOpen(it.key)} />
              <div className="px-3 pb-2 flex flex-col gap-1">
                {editing?.key === it.key ? (
                  <div className="flex gap-2">
                    <input
                      aria-label="Ghi chú"
                      value={editing.note}
                      maxLength={300}
                      onChange={(e) => setEditing({ key: it.key, note: e.target.value })}
                      className="flex-1 rounded-lg border border-outline-variant px-2 py-1 text-xs"
                    />
                    <Button size="sm" onClick={() => void saveNote()}>Lưu</Button>
                  </div>
                ) : (
                  it.note && <p className="text-xs text-on-surface-variant">📝 {it.note}</p>
                )}
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setEditing({ key: it.key, note: it.note ?? "" })} className="text-primary hover:underline">
                    {it.note ? "Sửa ghi chú" : "Thêm ghi chú"}
                  </button>
                  <button type="button" onClick={() => void remove(it)} className="text-error hover:underline">Bỏ khỏi sổ tay</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="nb-history" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="nb-history" className="font-semibold text-on-surface flex items-center gap-1.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">history</span>
            Lịch sử tra
          </h2>
          {(history.data?.length ?? 0) > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void clear()}>Xoá lịch sử</Button>
          )}
        </div>
        {history.error && <p role="alert" className="text-body-sm text-error">{history.error}</p>}
        {history.data && history.data.length === 0 && <p className="text-body-sm text-on-surface-variant">Chưa tra từ nào.</p>}
        <ul className="flex flex-col gap-0.5">
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
