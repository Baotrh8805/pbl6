import React, { useState, useMemo, useId, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { CardDto } from "@/types/api.types";
import { parseImportText, unescapeDelimiter, type ReadingRule } from "@/features/decks/editor/importParser";

export interface ImportCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (cards: CardDto[]) => void;
}

type TermDefDelimiter = "tab" | "semicolon" | "comma" | "dash" | "pipe" | "slash" | "custom";
type CardDelimiter = "newline" | "semicolon" | "double_newline" | "dash" | "pipe" | "slash" | "custom";
type ReadingDelimiter = "same" | "paren" | "dash" | "pipe" | "slash" | "none" | "custom";

interface EditableImportCard {
  id: string;
  term: string;
  reading: string;
  meaning: string;
}

let nextUniqueId = 0;
function createUniqueCardId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `import-item-${Date.now()}-${++nextUniqueId}`;
}

const STORAGE_KEY = "nihongen_deck_import_options";

interface SavedImportOptions {
  termDefDelimType: TermDefDelimiter;
  customTermDefDelim: string;
  cardDelimType: CardDelimiter;
  customCardDelim: string;
  readingDelimType: ReadingDelimiter;
  customReadingDelim: string;
}

function loadSavedOptions(): Partial<SavedImportOptions> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Bỏ qua lỗi đọc localStorage
  }
  return {};
}

function saveOptions(opts: SavedImportOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // Bỏ qua lỗi ghi localStorage
  }
}

const TERM_DEF_OPTIONS: { value: TermDefDelimiter; label: string }[] = [
  { value: "tab", label: "Tab" },
  { value: "semicolon", label: "Dấu chấm phẩy (;)" },
  { value: "comma", label: "Dấu phẩy (,)" },
  { value: "dash", label: "Gạch ngang (-)" },
  { value: "pipe", label: "Gạch đứng (|)" },
  { value: "slash", label: "Gạch chéo (/)" },
  { value: "custom", label: "Tùy chỉnh" },
];

const READING_OPTIONS: { value: ReadingDelimiter; label: string }[] = [
  { value: "same", label: "Tự động (cột riêng hoặc ở đầu định nghĩa: おか - Nghĩa)" },
  { value: "paren", label: "Trong ngoặc 食べる（たべる）" },
  { value: "dash", label: "Sau dấu gạch ngang (-)" },
  { value: "pipe", label: "Sau dấu gạch đứng (|)" },
  { value: "slash", label: "Sau dấu gạch chéo (/)" },
  { value: "none", label: "Không có cách đọc" },
  { value: "custom", label: "Tùy chỉnh" },
];

const CARD_OPTIONS: { value: CardDelimiter; label: string }[] = [
  { value: "newline", label: "Dòng mới (Enter)" },
  { value: "semicolon", label: "Dấu chấm phẩy (;)" },
  { value: "double_newline", label: "Một dòng trống" },
  { value: "dash", label: "Gạch ngang (-)" },
  { value: "pipe", label: "Gạch đứng (|)" },
  { value: "slash", label: "Gạch chéo (/)" },
  { value: "custom", label: "Tùy chỉnh" },
];

const legendClass = "font-semibold block text-xs uppercase tracking-wider text-outline";
const customDelimClass =
  "w-full mt-1.5 px-3 py-1.5 text-xs font-mono rounded-lg bg-surface-container-lowest border border-surface-container-high focus:border-primary focus:ring-1 focus:ring-primary text-on-surface outline-none";

export const ImportCardsModal: React.FC<ImportCardsModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [rawText, setRawText] = useState("");
  const [termDefDelimType, setTermDefDelimType] = useState<TermDefDelimiter>(() => {
    return loadSavedOptions().termDefDelimType ?? "tab";
  });
  const [customTermDefDelim, setCustomTermDefDelim] = useState(() => {
    return loadSavedOptions().customTermDefDelim ?? "";
  });
  const [cardDelimType, setCardDelimType] = useState<CardDelimiter>(() => {
    return loadSavedOptions().cardDelimType ?? "newline";
  });
  const [customCardDelim, setCustomCardDelim] = useState(() => {
    return loadSavedOptions().customCardDelim ?? "";
  });
  const [readingDelimType, setReadingDelimType] = useState<ReadingDelimiter>(() => {
    return loadSavedOptions().readingDelimType ?? "same";
  });
  const [customReadingDelim, setCustomReadingDelim] = useState(() => {
    return loadSavedOptions().customReadingDelim ?? "";
  });

  // Tự động lưu lựa chọn của người dùng vào localStorage để cá nhân hóa thói quen
  useEffect(() => {
    saveOptions({
      termDefDelimType,
      customTermDefDelim,
      cardDelimType,
      customCardDelim,
      readingDelimType,
      customReadingDelim,
    });
  }, [termDefDelimType, customTermDefDelim, cardDelimType, customCardDelim, readingDelimType, customReadingDelim]);

  // Danh sách thẻ dạng có thể trực tiếp chỉnh sửa
  const [cards, setCards] = useState<EditableImportCard[]>([]);

  const rawTextId = useId();

  const effectiveTermDefDelim = useMemo(() => {
    switch (termDefDelimType) {
      case "tab": return "\t";
      case "semicolon": return ";";
      case "comma": return ",";
      case "dash": return "-";
      case "pipe": return "|";
      case "slash": return "/";
      case "custom": return unescapeDelimiter(customTermDefDelim) || "\t";
      default: return "\t";
    }
  }, [termDefDelimType, customTermDefDelim]);

  const effectiveCardDelim = useMemo(() => {
    switch (cardDelimType) {
      case "newline": return "\n";
      case "semicolon": return ";";
      case "double_newline": return "\n\n";
      case "dash": return "-";
      case "pipe": return "|";
      case "slash": return "/";
      case "custom": return unescapeDelimiter(customCardDelim) || "\n";
      default: return "\n";
    }
  }, [cardDelimType, customCardDelim]);

  const readingRule = useMemo<ReadingRule>(() => {
    switch (readingDelimType) {
      case "paren": return { kind: "paren" };
      case "dash": return { kind: "delim", value: "-" };
      case "pipe": return { kind: "delim", value: "|" };
      case "slash": return { kind: "delim", value: "/" };
      case "none": return { kind: "none" };
      case "custom": {
        const v = unescapeDelimiter(customReadingDelim);
        return v ? { kind: "delim", value: v } : { kind: "same" };
      }
      case "same":
      default:
        return { kind: "same" };
    }
  }, [readingDelimType, customReadingDelim]);

  // Theo dõi nguồn dữ liệu phân tách để cập nhật lại thẻ khi nguồn thay đổi
  const [prevSource, setPrevSource] = useState({
    text: "",
    termDelim: "",
    cardDelim: "",
    readingKey: "",
  });

  const currentReadingKey = JSON.stringify(readingRule);
  if (
    prevSource.text !== rawText ||
    prevSource.termDelim !== effectiveTermDefDelim ||
    prevSource.cardDelim !== effectiveCardDelim ||
    prevSource.readingKey !== currentReadingKey
  ) {
    setPrevSource({
      text: rawText,
      termDelim: effectiveTermDefDelim,
      cardDelim: effectiveCardDelim,
      readingKey: currentReadingKey,
    });
    const parsed = parseImportText(rawText, effectiveTermDefDelim, effectiveCardDelim, readingRule);
    setCards(
      parsed.map((c) => ({
        id: createUniqueCardId(),
        term: c.term || "",
        reading: c.reading || "",
        meaning: c.meaning || "",
      }))
    );
  }

  // Cập nhật giá trị một trường của thẻ
  const handleCardChange = (id: string, field: "term" | "reading" | "meaning", value: string) => {
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, [field]: value } : card))
    );
  };

  // Xóa một hàng thẻ
  const handleRemoveCard = (id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  };

  // Thêm một hàng thẻ mới vào bảng
  const handleAddCard = () => {
    setCards((prev) => [
      ...prev,
      {
        id: createUniqueCardId(),
        term: "",
        reading: "",
        meaning: "",
      },
    ]);
  };

  // Làm mới lại bảng từ văn bản dán ở trên
  const handleResetFromText = () => {
    const parsed = parseImportText(rawText, effectiveTermDefDelim, effectiveCardDelim, readingRule);
    setCards(
      parsed.map((c) => ({
        id: createUniqueCardId(),
        term: c.term || "",
        reading: c.reading || "",
        meaning: c.meaning || "",
      }))
    );
  };

  // Các thẻ có ít nhất thuật ngữ hoặc nội dung
  const validCards = useMemo(
    () => cards.filter((c) => c.term.trim() || c.meaning.trim()),
    [cards]
  );

  // Danh sách các thẻ thiếu định nghĩa (đã có thuật ngữ nhưng chưa có nghĩa)
  const incompleteCards = useMemo(
    () => cards.filter((c) => c.term.trim() && !c.meaning.trim()),
    [cards]
  );

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const meaningRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Tìm dòng chưa có định nghĩa tiếp theo sau dòng hiện tại
  const findNextIncomplete = useCallback(
    (currentId?: string): EditableImportCard | undefined => {
      if (cards.length === 0) return undefined;
      const incompleteList = cards.filter((c) => c.term.trim() && !c.meaning.trim());
      if (incompleteList.length === 0) return undefined;

      if (!currentId) return incompleteList[0];

      const currentIdx = cards.findIndex((c) => c.id === currentId);
      // Tìm dòng trống nằm phía sau dòng hiện tại
      const nextAfter = cards
        .slice(currentIdx + 1)
        .find((c) => c.term.trim() && !c.meaning.trim());
      if (nextAfter) return nextAfter;

      // Nếu không còn phía sau, quay lại dòng trống đầu tiên từ trên xuống
      return incompleteList.find((c) => c.id !== currentId);
    },
    [cards]
  );

  // Cuộn mượt và luôn đưa dòng chỉ định vào CHÍNH GIỮA khung nhìn của bảng, sau đó focus ô định nghĩa
  const focusIncompleteCard = useCallback((id: string) => {
    const container = tableContainerRef.current;
    const row = rowRefs.current[id];
    const el = meaningRefs.current[id];

    // 1. Cho thanh trượt bên ngoài (thân modal) cuộn xuống cuối để mở trọn vẹn vùng bảng xem trước
    const outerContainer = container?.parentElement?.closest<HTMLDivElement>(".overflow-y-auto");
    if (outerContainer) {
      outerContainer.scrollTo({
        top: outerContainer.scrollHeight,
        behavior: "smooth",
      });
    }

    // 2. Cho thanh trượt bên trong cuộn đưa dòng chỉ định vào CHÍNH GIỮA bảng
    if (container && row) {
      const rowRect = row.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Tâm của dòng (row center) so với tâm của khung bảng (container center)
      const rowCenterY = (rowRect.top + rowRect.bottom) / 2;
      const containerCenterY = (containerRect.top + containerRect.bottom) / 2;
      const delta = rowCenterY - containerCenterY;

      container.scrollTo({
        top: container.scrollTop + delta,
        behavior: "smooth",
      });
    } else if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (el) {
      // Quan trọng: preventScroll: true để focus mặc định không làm mất vị trí giữa vừa cuộn
      el.focus({ preventScroll: true });
      // Hiệu ứng highlight nhẹ để nhận biết ngay ô vừa nhảy tới
      el.classList.add("ring-2", "ring-error");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-error");
      }, 1500);
    }
  }, []);

  // Điều hướng tới dòng trống tiếp theo
  const goToNextIncomplete = useCallback(() => {
    const activeEl = document.activeElement;
    const activeId = Object.entries(meaningRefs.current).find(
      ([, el]) => el === activeEl
    )?.[0];

    const target = findNextIncomplete(activeId);
    if (target) {
      focusIncompleteCard(target.id);
    }
  }, [findNextIncomplete, focusIncompleteCard]);

  const handleConfirmImport = () => {
    if (validCards.length === 0) return;
    const finalCards: CardDto[] = validCards.map((c) => ({
      term: c.term.trim(),
      reading: c.reading.trim() || null,
      meaning: c.meaning.trim(),
    }));
    onImport(finalCards);
    setRawText("");
    setCards([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nhập dữ liệu."
      icon="post_add"
      size="4xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onClose}
            className="cursor-pointer"
          >
            Hủy nhập
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={validCards.length === 0}
            onClick={handleConfirmImport}
            className="cursor-pointer shadow-xs"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              download_done
            </span>
            Nhập {validCards.length > 0 ? `(${validCards.length} thẻ)` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label htmlFor={rawTextId} className="block text-body-sm text-on-surface-variant mb-2">
            Sao chép và dán dữ liệu của bạn vào đây (từ Word, Excel, Google Trang tính, Anki, v.v.)
          </label>
          <textarea
            id={rawTextId}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder={`Dán nội dung vào đây theo mẫu:\n開発\tかいはつ\tphát triển\t新製品を開発する。\n設計\tせっけい\tthiết kế\tシステムを設計する。\n\nHoặc định dạng 2 cột:\n開発\tphát triển\n設計\tthiết kế`}
            className="w-full font-mono text-sm p-4 rounded-xl bg-surface-container-low/60 border border-surface-container-high focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-outline/50 resize-y outline-none transition-all"
          />
        </div>

        {/* Delimiter Settings */}
        <div className="p-4 rounded-xl bg-surface-container-low/30 border border-surface-container-high/60 text-body-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-high/40">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">tune</span>
              Tùy chọn phân tách dữ liệu
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check_circle</span>
              Tự động lưu thói quen của bạn
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Between term and definition */}
            <fieldset className="space-y-2">
              <legend className={legendClass}>Giữa thuật ngữ và định nghĩa</legend>
              <div className="flex flex-col space-y-1.5">
                {TERM_DEF_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface hover:text-primary transition-colors">
                    <input
                      type="radio"
                      name="termDefDelim"
                      checked={termDefDelimType === opt.value}
                      onChange={() => setTermDefDelimType(opt.value)}
                      className="accent-primary w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {termDefDelimType === "custom" && (
                <input
                  type="text"
                  aria-label="Ký tự phân cách giữa thuật ngữ và định nghĩa"
                  value={customTermDefDelim}
                  onChange={(e) => setCustomTermDefDelim(e.target.value)}
                  placeholder="Ví dụ: - hoặc | (trống = Tab)"
                  className={customDelimClass}
                />
              )}
            </fieldset>

            {/* Between term and reading */}
            <fieldset className="space-y-2">
              <legend className={legendClass}>Giữa thuật ngữ và cách đọc</legend>
              <div className="flex flex-col space-y-1.5">
                {READING_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface hover:text-primary transition-colors">
                    <input
                      type="radio"
                      name="readingDelim"
                      checked={readingDelimType === opt.value}
                      onChange={() => setReadingDelimType(opt.value)}
                      className="accent-primary w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              {readingDelimType === "custom" && (
                <input
                  type="text"
                  aria-label="Ký tự phân cách giữa thuật ngữ và cách đọc"
                  value={customReadingDelim}
                  onChange={(e) => setCustomReadingDelim(e.target.value)}
                  placeholder="Ví dụ: | hoặc : (trống = cột riêng)"
                  className={customDelimClass}
                />
              )}
            </fieldset>

            {/* Between cards */}
            <fieldset className="space-y-2">
              <legend className={legendClass}>Giữa các thẻ</legend>
              <div className="flex flex-col space-y-1.5">
                {CARD_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface hover:text-primary transition-colors">
                    <input
                      type="radio"
                      name="cardDelim"
                      checked={cardDelimType === opt.value}
                      onChange={() => setCardDelimType(opt.value)}
                      className="accent-primary w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {cardDelimType === "custom" && (
                <input
                  type="text"
                  aria-label="Ký tự phân cách giữa các thẻ"
                  value={customCardDelim}
                  onChange={(e) => setCustomCardDelim(e.target.value)}
                  placeholder="Ví dụ: \n\n = một dòng trống (trống = xuống dòng)"
                  className={customDelimClass}
                />
              )}
            </fieldset>
          </div>
        </div>

        {/* Live Preview & Editable Table Area */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-outline flex items-center gap-2">
                <span>XEM TRƯỚC VÀ CHỈNH SỬA DỮ LIỆU</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                  {cards.length} THẺ
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {rawText.trim() && (
                <button
                  type="button"
                  onClick={handleResetFromText}
                  className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                  title="Khôi phục lại dữ liệu gốc từ văn bản phía trên"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    refresh
                  </span>
                  <span>Làm mới từ văn bản</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAddCard}
                className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline cursor-pointer"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  add
                </span>
                <span>Thêm dòng</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-on-surface-variant mb-2.5">
            Bạn có thể chỉnh sửa trực tiếp nội dung các ô bên dưới trước khi bấm nhập.
          </p>

          {incompleteCards.length > 0 && (
            <div className="mb-2.5 p-2 px-3 rounded-xl bg-error/10 border border-error/25 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-error font-medium">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0">
                  warning
                </span>
                <span>{incompleteCards.length} dòng chưa có định nghĩa:</span>
                <div className="flex flex-wrap items-center gap-1 ml-1">
                  {incompleteCards.map((c) => {
                    const rowIdx = cards.findIndex((item) => item.id === c.id) + 1;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => focusIncompleteCard(c.id)}
                        className="px-2 py-0.5 rounded-md bg-surface-container-lowest border border-error/40 text-error font-semibold hover:bg-error/20 hover:border-error transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                        title={`Bấm để chuyển nhanh tới dòng ${rowIdx}`}
                      >
                        <span>Dòng {rowIdx}</span>
                        {c.term && (
                          <span className="opacity-75 font-japanese text-[11px] max-w-[70px] truncate">
                            ({c.term})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={goToNextIncomplete}
                className="px-2.5 py-1 rounded-lg bg-error hover:bg-error/90 active:scale-95 text-white font-semibold flex items-center gap-1 shadow-2xs transition-all cursor-pointer shrink-0 ml-auto"
                title="Đi tới dòng trống tiếp theo (nhấn Tab ở ô định nghĩa để chuyển tiếp nhanh)"
              >
                <span>Đi tới dòng trống</span>
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  arrow_downward
                </span>
              </button>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-surface-container-high rounded-xl text-on-surface-variant/70 text-sm">
              Chưa có dữ liệu. Hãy dán văn bản vào ô trên hoặc bấm &quot;Thêm dòng&quot; để nhập trực tiếp.
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="border border-surface-container-high rounded-xl overflow-hidden max-h-[380px] overflow-y-auto"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-container text-on-surface font-semibold sticky top-0 z-10 border-b border-surface-container-high shadow-xs">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-[26%]">Thuật ngữ / Kanji</th>
                    <th className="py-2.5 px-3 w-[24%]">Cách đọc (Furigana)</th>
                    <th className="py-2.5 px-3">Nội dung (Định nghĩa, ví dụ)</th>
                    <th className="py-2.5 px-2 w-10 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/50 bg-surface-container-lowest">
                  {cards.map((card, idx) => (
                    <tr
                      key={card.id}
                      ref={(el) => {
                        rowRefs.current[card.id] = el;
                      }}
                      className="hover:bg-surface-container-low/30 transition-colors group"
                    >
                      {/* Số thứ tự */}
                      <td className="py-2 px-3 text-center text-outline font-medium align-middle">
                        {idx + 1}
                      </td>

                      {/* Thuật ngữ / Kanji */}
                      <td className="py-2 px-2 align-middle">
                        <input
                          type="text"
                          value={card.term}
                          onChange={(e) => handleCardChange(card.id, "term", e.target.value)}
                          placeholder="Thuật ngữ / Kanji..."
                          className={`w-full px-2.5 py-1.5 text-xs font-japanese font-semibold rounded-lg bg-surface-container-low/40 border ${
                            card.term.trim() ? "border-surface-container-high" : "border-amber-400/60"
                          } focus:border-primary focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary text-on-surface outline-none transition-all placeholder:text-outline/40`}
                        />
                      </td>

                      {/* Cách đọc */}
                      <td className="py-2 px-2 align-middle">
                        <input
                          type="text"
                          value={card.reading}
                          onChange={(e) => handleCardChange(card.id, "reading", e.target.value)}
                          placeholder="Cách đọc (tùy chọn)..."
                          className="w-full px-2.5 py-1.5 text-xs font-japanese rounded-lg bg-surface-container-low/40 border border-surface-container-high focus:border-primary focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary text-on-surface-variant outline-none transition-all placeholder:text-outline/40"
                        />
                      </td>

                      {/* Nội dung */}
                      <td className="py-2 px-2 align-middle">
                        <textarea
                          ref={(el) => {
                            meaningRefs.current[card.id] = el;
                          }}
                          rows={2}
                          value={card.meaning}
                          onChange={(e) => handleCardChange(card.id, "meaning", e.target.value)}
                          onKeyDown={(e) => {
                            // Nhấn Tab: nếu còn dòng trống khác thì tự động nhảy sang ô định nghĩa của dòng trống tiếp theo
                            if (e.key === "Tab" && !e.shiftKey) {
                              const nextIncomplete = findNextIncomplete(card.id);
                              if (nextIncomplete) {
                                e.preventDefault();
                                focusIncompleteCard(nextIncomplete.id);
                              }
                            }
                          }}
                          placeholder="Nội dung / Định nghĩa..."
                          className={`w-full px-2.5 py-1.5 text-xs rounded-lg bg-surface-container-low/40 border ${
                            card.meaning.trim() ? "border-surface-container-high" : "border-error/70 ring-1 ring-error/25 bg-error/5"
                          } focus:border-primary focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary text-on-surface outline-none transition-all resize-y placeholder:text-outline/40 leading-relaxed min-h-[36px]`}
                        />
                      </td>

                      {/* Nút xóa */}
                      <td className="py-2 px-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleRemoveCard(card.id)}
                          className="p-1 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                          title="Xóa hàng này"
                          aria-label={`Xóa hàng ${idx + 1}`}
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            delete
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
