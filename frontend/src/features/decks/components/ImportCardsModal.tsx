import React, { useState, useMemo, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { CardDto } from "@/types/api.types";

export interface ImportCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (cards: CardDto[]) => void;
}

type TermDefDelimiter = "tab" | "comma" | "custom";
type CardDelimiter = "newline" | "semicolon" | "custom";

const TERM_DEF_OPTIONS: { value: TermDefDelimiter; label: string }[] = [
  { value: "tab", label: "Tab" },
  { value: "comma", label: "Dấu phẩy (,)" },
  { value: "custom", label: "Tùy chỉnh" },
];

const CARD_OPTIONS: { value: CardDelimiter; label: string }[] = [
  { value: "newline", label: "Dòng mới" },
  { value: "semicolon", label: "Dấu chấm phẩy (;)" },
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
  const [termDefDelimType, setTermDefDelimType] = useState<TermDefDelimiter>("tab");
  const [customTermDefDelim, setCustomTermDefDelim] = useState("-");
  const [cardDelimType, setCardDelimType] = useState<CardDelimiter>("newline");
  const [customCardDelim, setCustomCardDelim] = useState("\\n\\n");

  const rawTextId = useId();

  const effectiveTermDefDelim = useMemo(() => {
    if (termDefDelimType === "tab") return "\t";
    if (termDefDelimType === "comma") return ",";
    return customTermDefDelim || "\t";
  }, [termDefDelimType, customTermDefDelim]);

  const effectiveCardDelim = useMemo(() => {
    if (cardDelimType === "newline") return "\n";
    if (cardDelimType === "semicolon") return ";";
    return customCardDelim || "\n";
  }, [cardDelimType, customCardDelim]);

  // Realtime parse cards from rawText
  const parsedCards: CardDto[] = useMemo(() => {
    if (!rawText.trim()) return [];

    // Normalize Windows/Mac line endings if newline delimiter
    let text = rawText;
    if (effectiveCardDelim === "\n") {
      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    const rawRows = text.split(effectiveCardDelim);
    const result: CardDto[] = [];

    for (const row of rawRows) {
      const trimmedRow = row.trim();
      if (!trimmedRow) continue;

      const tokens = trimmedRow
        .split(effectiveTermDefDelim)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tokens.length === 0) continue;

      if (tokens.length === 1) {
        // Only 1 token: put in term, meaning empty
        result.push({
          term: tokens[0],
          reading: null,
          meaning: "",
          example: null,
        });
      } else if (tokens.length === 2) {
        // [term, meaning]
        result.push({
          term: tokens[0],
          reading: null,
          meaning: tokens[1],
          example: null,
        });
      } else if (tokens.length === 3) {
        // [term, reading, meaning]
        result.push({
          term: tokens[0],
          reading: tokens[1],
          meaning: tokens[2],
          example: null,
        });
      } else {
        // [term, reading, meaning, ...example]
        result.push({
          term: tokens[0],
          reading: tokens[1],
          meaning: tokens[2],
          example: tokens.slice(3).join(" "),
        });
      }
    }

    return result;
  }, [rawText, effectiveTermDefDelim, effectiveCardDelim]);

  const handleConfirmImport = () => {
    if (parsedCards.length === 0) return;
    onImport(parsedCards);
    setRawText("");
    onClose();
  };

  // State nằm ở component ngoài (luôn mount) để giữ văn bản đã dán khi bấm "Hủy nhập" rồi mở lại.
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nhập dữ liệu."
      icon="post_add"
      size="3xl"
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
            disabled={parsedCards.length === 0}
            onClick={handleConfirmImport}
            className="cursor-pointer shadow-xs"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              download_done
            </span>
            Nhập {parsedCards.length > 0 ? `(${parsedCards.length} thẻ)` : ""}
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
            rows={7}
            placeholder={`Dán nội dung vào đây theo mẫu:\n開発\tかいはつ\tphát triển\t新製品を開発する。\n設計\tせっけい\tthiết kế\tシステムを設計する。\n\nHoặc định dạng 2 cột:\n開発\tphát triển\n設計\tthiết kế`}
            className="w-full font-mono text-sm p-4 rounded-xl bg-surface-container-low/60 border border-surface-container-high focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-outline/50 resize-y outline-none transition-all"
          />
        </div>

        {/* Delimiter Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-surface-container-low/30 border border-surface-container-high/60 text-body-sm">
          {/* Between term and definition */}
          <fieldset className="space-y-2.5">
            <legend className={legendClass}>Giữa thuật ngữ và định nghĩa</legend>
            <div className="flex flex-wrap items-center gap-4">
              {TERM_DEF_OPTIONS.map((opt) => (
                <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="termDefDelim"
                    checked={termDefDelimType === opt.value}
                    onChange={() => setTermDefDelimType(opt.value)}
                    className="accent-primary w-4 h-4 cursor-pointer"
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
                placeholder="Ký tự phân cách (vd: - hoặc |)"
                className={customDelimClass}
              />
            )}
          </fieldset>

          {/* Between cards */}
          <fieldset className="space-y-2.5">
            <legend className={legendClass}>Giữa các thẻ</legend>
            <div className="flex flex-wrap items-center gap-4">
              {CARD_OPTIONS.map((opt) => (
                <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="cardDelim"
                    checked={cardDelimType === opt.value}
                    onChange={() => setCardDelimType(opt.value)}
                    className="accent-primary w-4 h-4 cursor-pointer"
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
                placeholder="Ký tự phân cách thẻ"
                className={customDelimClass}
              />
            )}
          </fieldset>
        </div>

        {/* Live Preview Area */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-bold text-xs uppercase tracking-wider text-outline flex items-center gap-2">
              <span>XEM TRƯỚC</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {parsedCards.length} THẺ
              </span>
            </h3>
            {parsedCards.length > 0 && (
              <span className="text-xs text-on-surface-variant">
                {parsedCards.length > 50 ? "Hiển thị 50 thẻ đầu tiên" : `Sẵn sàng nhập ${parsedCards.length} thẻ`}
              </span>
            )}
          </div>

          {parsedCards.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-surface-container-high rounded-xl text-on-surface-variant/70 text-sm">
              Chưa có dữ liệu. Hãy dán văn bản vào ô trên để xem trước danh sách thẻ.
            </div>
          ) : (
            <div className="border border-surface-container-high rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container text-on-surface font-semibold sticky top-0 border-b border-surface-container-high">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3 w-1/4">Thuật ngữ / Kanji</th>
                    <th className="py-2.5 px-3 w-1/4">Cách đọc (Furigana)</th>
                    <th className="py-2.5 px-3 w-1/4">Định nghĩa</th>
                    <th className="py-2.5 px-3">Câu ví dụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/50 bg-surface-container-lowest">
                  {parsedCards.slice(0, 50).map((c, idx) => (
                    // Bảng chỉ đọc, dựng lại từ văn bản mỗi lần gõ -> key nội dung + vị trí là đủ.
                    <tr key={`${idx}:${c.term}`} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="py-2 px-3 text-center text-outline font-medium">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-on-surface font-japanese">{c.term}</td>
                      <td className="py-2 px-3 text-on-surface-variant font-japanese">{c.reading || "—"}</td>
                      <td className="py-2 px-3 text-on-surface font-medium">{c.meaning || "—"}</td>
                      <td className="py-2 px-3 text-on-surface-variant text-[11px] truncate max-w-xs">{c.example || "—"}</td>
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
