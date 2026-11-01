import React, { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import type { CardKind, ExtractionItem, ExtractionItemPatch, ExtractionStats } from "@/types/api.types";
import { KIND_LABELS, UNKNOWN_LEVEL, filterItems, itemMeaning, type ItemFilter } from "../extractionUtils";
import { LevelBadge } from "./LevelBadge";
import { ConflictBadge } from "./ConflictBadge";
import { HanVietBadge } from "@/features/hanviet/components/HanVietBadge";
import { hasConflicts, itemConflicts } from "../conflictUtils";

interface ExtractionItemsPanelProps {
  items: ExtractionItem[];
  stats: ExtractionStats | null;
  /** Gửi PATCH; nơi gọi cập nhật state items và lo lỗi. */
  onPatch: (patches: ExtractionItemPatch[]) => Promise<void>;
  onCreateDecks: () => void;
  /** Đang PATCH hoặc tạo bộ thẻ: khoá thao tác hàng loạt để không gửi chồng. */
  busy: boolean;
}

const inlineInput =
  "w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary focus:outline-none text-body-sm text-on-surface px-0.5 py-0.5 transition-colors";

// Một hàng item: tick chọn, thuật ngữ + furigana, cảnh báo mâu thuẫn với nguồn chuẩn (F2), ô sửa cách đọc / nghĩa (lưu khi
// blur), cấp, tần suất, ví dụ.
// Giá trị đang gõ giữ ở state riêng để không PATCH mỗi phím; blur mà không đổi thì không gửi.
const ItemRow: React.FC<{
  item: ExtractionItem;
  onPatch: (patch: ExtractionItemPatch) => void;
}> = ({ item, onPatch }) => {
  const [reading, setReading] = useState(item.reading ?? "");
  const [meaning, setMeaning] = useState(itemMeaning(item));
  const [open, setOpen] = useState(false);
  const checkId = useId();
  const conflicts = itemConflicts(item);

  const commitReading = () => {
    const next = reading.trim();
    if (next !== (item.reading ?? "")) onPatch({ id: item.id, reading: next }); // "" = xoá (backend: rỗng -> null)
  };
  // Nghĩa sửa tay ghi vào meaningVi (thẻ sinh ra dùng meaningVi ?? meaningEn nên bản sửa luôn thắng).
  const commitMeaning = () => {
    const next = meaning.trim();
    if (next !== itemMeaning(item)) onPatch({ id: item.id, meaningVi: next }); // "" = xoá, thẻ quay về nghĩa EN
  };

  return (
    <li
      className={`rounded-xl border transition-colors ${
        item.selected ? "bg-surface-container-lowest border-surface-container-high" : "bg-surface-container-low/60 border-transparent opacity-70"
      }`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 p-3 items-start">
        <input
          id={checkId}
          type="checkbox"
          checked={item.selected}
          onChange={(e) => onPatch({ id: item.id, selected: e.target.checked })}
          className="mt-1.5 rounded accent-primary cursor-pointer"
          aria-label={`Chọn ${item.term}`}
        />

        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-title-md font-semibold font-japanese text-on-surface">
              <Ruby term={item.term} reading={item.reading ?? undefined} segments={item.readingSegments} />
            </span>
            {item.surface && item.surface !== item.term && (
              <span lang="ja" className="text-label-sm text-outline" title="Dạng gặp trong văn bản">
                ({item.surface})
              </span>
            )}
            {item.pos && <span className="text-label-sm text-outline">{item.pos}</span>}
            {item.hanViet && <HanVietBadge hanViet={item.hanViet} />}
            <ConflictBadge conflicts={conflicts} term={item.term} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-0.5">
            {item.kind === "vocab" && (
              <label className="flex flex-col">
                <span className="sr-only">Cách đọc của {item.term}</span>
                <input
                  lang="ja"
                  value={reading}
                  placeholder="Cách đọc"
                  onChange={(e) => setReading(e.target.value)}
                  onBlur={commitReading}
                  className={inlineInput}
                />
              </label>
            )}
            <label className="flex flex-col sm:col-start-2">
              <span className="sr-only">Nghĩa của {item.term}</span>
              <input
                value={meaning}
                placeholder={item.meaningEn || item.meaningVi ? "Nghĩa" : "Chưa có nghĩa – nhập tay"}
                onChange={(e) => setMeaning(e.target.value)}
                onBlur={commitMeaning}
                className={inlineInput}
              />
            </label>
          </div>

          {open && (item.example || item.exampleVi) && (
            <div className="mt-1 p-2 rounded-lg bg-surface-container-low text-body-sm">
              {item.example && (
                <p lang="ja" className="font-japanese text-on-surface">
                  {item.example}
                </p>
              )}
              {item.exampleVi && <p className="text-on-surface-variant mt-0.5">{item.exampleVi}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <LevelBadge item={item} />
          <span className="text-label-sm text-outline tabular-nums" title="Số lần gặp trong tài liệu">
            ×{item.frequency}
          </span>
          {item.example && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Ẩn ví dụ" : "Xem ví dụ"}
              title={open ? "Ẩn ví dụ" : "Xem câu ví dụ trong tài liệu"}
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {open ? "expand_less" : "expand_more"}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-label-sm font-semibold border transition-colors cursor-pointer ${
    active
      ? "bg-primary-container text-on-primary border-primary-container"
      : "bg-surface-container-lowest text-on-surface-variant border-surface-container-high hover:bg-surface-container"
  }`;

// Cột phải khi DONE: tab Từ vựng / Ngữ pháp, lọc cấp, chỉ mục mâu thuẫn, tìm, chọn hàng loạt, danh sách item sửa được.
export const ExtractionItemsPanel: React.FC<ExtractionItemsPanelProps> = ({ items, stats, onPatch, onCreateDecks, busy }) => {
  const [filter, setFilter] = useState<ItemFilter>({ kind: "vocab", level: "", query: "" });
  // Lọc mâu thuẫn tách khỏi ItemFilter (extractionUtils dùng chung nhiều nơi) và áp sau filterItems.
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const searchId = useId();

  const counts = useMemo(() => {
    const out = { vocab: 0, grammar: 0, selected: 0, conflicts: 0, conflictsInKind: 0 };
    for (const it of items) {
      out[it.kind]++;
      if (it.selected) out.selected++;
      if (hasConflicts(it)) {
        out.conflicts++;
        if (it.kind === filter.kind) out.conflictsInKind++;
      }
    }
    return out;
  }, [items, filter.kind]);

  // Chạy lại / kiểm tra lại xong không còn mâu thuẫn nào: tắt lọc để danh sách không trống khó hiểu.
  const conflictFilterOn = onlyConflicts && counts.conflicts > 0;
  const visible = useMemo(() => {
    const base = filterItems(items, filter);
    return conflictFilterOn ? base.filter(hasConflicts) : base;
  }, [items, filter, conflictFilterOn]);
  const allVisibleSelected = visible.length > 0 && visible.every((it) => it.selected);

  const toggleVisible = () => {
    const target = !allVisibleSelected;
    const patches = visible.filter((it) => it.selected !== target).map((it) => ({ id: it.id, selected: target }));
    if (patches.length) void onPatch(patches);
  };

  const byLevel = stats?.byLevel ?? {};
  const levelChips: { key: string; label: string }[] = [
    ...JLPT_LEVELS.map((lvl) => ({ key: lvl, label: lvl })),
    { key: UNKNOWN_LEVEL, label: "Chưa rõ" },
  ];

  return (
    <section className="flex flex-col gap-3 p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-title-md text-title-md font-bold text-on-surface">Kết quả bóc tách</h2>
          <p className="text-label-sm text-outline mt-0.5">
            {stats ? `${stats.sentences} ${stats.layout === "list" ? "dòng" : "câu"} · ${stats.tokens} từ · ` : ""}
            đã chọn {counts.selected}/{items.length}
          </p>
        </div>
        <Button type="button" variant="accent" size="sm" onClick={onCreateDecks} disabled={busy || counts.selected === 0}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">library_add</span>
          Tạo bộ thẻ
        </Button>
      </div>

      {/* Tab loại item */}
      <div role="tablist" aria-label="Loại kết quả" className="flex gap-1 p-1 rounded-lg bg-surface-container-low w-fit">
        {(Object.keys(KIND_LABELS) as CardKind[]).map((kind) => {
          const active = filter.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter((f) => ({ ...f, kind }))}
              className={`px-3 py-1.5 rounded-md text-label-md font-semibold transition-colors cursor-pointer ${
                active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {KIND_LABELS[kind]} ({counts[kind]})
            </button>
          );
        })}
      </div>

      {/* Lọc cấp + tìm kiếm */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo cấp độ">
          <button type="button" onClick={() => setFilter((f) => ({ ...f, level: "" }))} className={chipClass(filter.level === "")}>
            Tất cả
          </button>
          {levelChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, level: f.level === c.key ? "" : c.key }))}
              className={chipClass(filter.level === c.key)}
            >
              {c.label}
              {byLevel[c.key] != null && <span className="ml-1 opacity-70 tabular-nums">{byLevel[c.key]}</span>}
            </button>
          ))}
          {counts.conflicts > 0 && (
            <button
              type="button"
              aria-pressed={conflictFilterOn}
              onClick={() => setOnlyConflicts((v) => !v)}
              title="Chỉ hiện mục mà tài liệu ghi khác nguồn tri thức chuẩn"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm font-semibold border transition-colors cursor-pointer ${
                conflictFilterOn
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">warning</span>
              Chỉ mục mâu thuẫn ({counts.conflictsInKind})
            </button>
          )}
        </div>
        <div className="relative sm:ml-auto sm:w-56">
          <label htmlFor={searchId} className="sr-only">
            Tìm trong kết quả
          </label>
          <span aria-hidden="true" className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-outline">
            search
          </span>
          <input
            id={searchId}
            type="text"
            enterKeyHint="search"
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="Tìm từ, cách đọc, nghĩa…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
        <span>{visible.length} mục</span>
        <button
          type="button"
          onClick={toggleVisible}
          disabled={busy || visible.length === 0}
          className="font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
        >
          {allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"} (đang hiện)
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-outline">
          {items.length === 0
            ? "Không bóc tách được mục nào từ tài liệu này."
            : conflictFilterOn && counts.conflictsInKind === 0
              ? `Không có mục ${KIND_LABELS[filter.kind].toLowerCase()} nào mâu thuẫn với nguồn chuẩn.`
              : "Không có mục nào khớp bộ lọc."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
          {visible.map((it) => (
            <ItemRow key={it.id} item={it} onPatch={(p) => void onPatch([p])} />
          ))}
        </ul>
      )}
    </section>
  );
};
