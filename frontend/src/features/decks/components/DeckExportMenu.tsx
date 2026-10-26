import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { downloadDeckExport } from "@/services/deckShareService";

const MENU_WIDTH = 288; // w-72

// Xuất bộ thẻ (UC-29): CSV (Excel), tệp cho Anki, bản in / PDF (trang in + "Lưu PDF" của trình duyệt).
export const DeckExportMenu: React.FC<{ deckId: string }> = ({ deckId }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Neo menu theo chỗ trống lúc mở: nút nằm sát trái (điện thoại) thì mở sang phải, ngược lại mở sang trái.
  const [alignLeft, setAlignLeft] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const download = async (format: "csv" | "anki") => {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      await downloadDeckExport(deckId, format);
      setOpen(false);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const item = "w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container flex items-start gap-2 text-body-sm";
  return (
    <div ref={boxRef} className="relative">
      <Button variant="outline" size="md" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setAlignLeft(r.right < MENU_WIDTH + 16);
        setOpen((v) => !v);
      }} aria-expanded={open} aria-haspopup="menu" title="Xuất bộ thẻ ra tệp">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
        Xuất
      </Button>
      {open && (
        <div role="menu" className={`absolute ${alignLeft ? "left-0" : "right-0"} z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-lg p-1.5`}>
          <button type="button" role="menuitem" className={item} onClick={() => void download("csv")} disabled={!!busy}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">table</span>
            <span><span className="font-semibold block">{busy === "csv" ? "Đang tải…" : "CSV (Excel)"}</span>
              <span className="text-xs text-on-surface-variant">Thuật ngữ, cách đọc, nghĩa, cấp, Hán-Việt</span></span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => void download("anki")} disabled={!!busy}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">style</span>
            <span><span className="font-semibold block">{busy === "anki" ? "Đang tải…" : "Anki (.txt)"}</span>
              <span className="text-xs text-on-surface-variant">Trong Anki: File → Import, chọn tệp này</span></span>
          </button>
          <Link role="menuitem" to={`/decks/${encodeURIComponent(deckId)}/print`} className={item} onClick={() => setOpen(false)}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">print</span>
            <span><span className="font-semibold block">In / PDF</span>
              <span className="text-xs text-on-surface-variant">Mở bản in, chọn "Lưu dưới dạng PDF"</span></span>
          </Link>
          {error && <p role="alert" className="px-3 py-1 text-xs text-error">{error}</p>}
        </div>
      )}
    </div>
  );
};
