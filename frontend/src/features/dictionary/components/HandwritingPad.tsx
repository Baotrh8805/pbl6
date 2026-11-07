import React, { useEffect, useRef, useState } from "react";
import { KanjiCanvas, type CanvasStroke } from "@/features/practice/components/KanjiCanvas";
import { extractErrorMessage } from "@/services/apiClient";
import { recognizeHandwriting } from "@/services/dictionaryService";

const DEBOUNCE_MS = 250;
const PAD_SIZE = 220;

// Vẽ chữ Hán để tra (cải tiến 26/10, như Mazii): vẽ từng nét vào ô, sau mỗi nét server gợi ý các chữ giống nhất (dữ liệu nét
// KanjiVG ~2 000 chữ thường dùng). Bấm một chữ → onPick; ô được xoá để vẽ chữ tiếp theo. Vẽ sai thứ tự / thiếu một nét vẫn ra.
// Bố cục tự xuống dòng theo bề rộng khung chứa (không theo breakpoint màn hình): popover / bottom sheet ở tab Từ vựng, khung rộng ở tab
// Hán tự đều xếp canvas cạnh gợi ý khi đủ chỗ. onClose có thì hiện nút ✕ ở đầu khung.
export const HandwritingPad: React.FC<{ onPick: (ch: string) => void; pickHint: string; onClose?: () => void }> = ({ onPick, pickHint, onClose }) => {
  const [padKey, setPadKey] = useState(0);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleStrokes = (strokes: CanvasStroke[]) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++seq.current;
    if (strokes.length === 0) {
      setCandidates([]);
      setError(null);
      setBusy(false);
      return;
    }
    timer.current = setTimeout(() => {
      setBusy(true);
      recognizeHandwriting(strokes.map((s) => s.points.map((p) => ({ x: p.x, y: p.y }))))
        .then((res) => {
          if (id !== seq.current) return;
          setCandidates(res.map((c) => c.char));
          setError(null);
        })
        .catch((e) => id === seq.current && setError(extractErrorMessage(e)))
        .finally(() => id === seq.current && setBusy(false));
    }, DEBOUNCE_MS);
  };

  const pick = (ch: string) => {
    onPick(ch);
    seq.current++;
    setCandidates([]);
    setPadKey((k) => k + 1); // dựng lại canvas = xoá nét để vẽ chữ tiếp
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-surface-container-high bg-surface-container-low p-3">
      {onClose && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-label-md font-semibold text-on-surface inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">draw</span>
            Vẽ chữ Hán
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng ô vẽ (Esc)"
            title="Đóng (Esc)"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-start justify-center">
        <KanjiCanvas key={padKey} size={PAD_SIZE} onChange={handleStrokes} />
        <div className="flex-1 min-w-[150px] flex flex-col gap-2">
          <p className="text-xs text-on-surface-variant">
            Vẽ từng nét của một chữ Hán, chọn chữ đúng để {pickHint}. Sai thứ tự hay thiếu một nét vẫn tìm được.
          </p>
          <div role="listbox" aria-label="Chữ gợi ý" aria-busy={busy} className="flex flex-wrap gap-1.5 min-h-12">
            {candidates.map((ch, i) => (
              <button
                key={ch}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(ch)}
                lang="ja"
                title={i === 0 ? "Giống nhất" : undefined}
                className={`w-12 h-12 rounded-xl text-[26px] leading-none border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  i === 0
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-primary/5"
                }`}
              >
                {ch}
              </button>
            ))}
            {candidates.length === 0 && !busy && !error && <span className="text-xs text-outline self-center">Chưa có gợi ý.</span>}
            {busy && candidates.length === 0 && <span className="text-xs text-outline self-center">Đang nhận dạng…</span>}
          </div>
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
};
