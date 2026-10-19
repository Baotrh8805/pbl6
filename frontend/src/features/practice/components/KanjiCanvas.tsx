import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Point } from "@/lib/strokes";

// Bảng vẽ nét kanji (E2): <canvas> bắt pointer events (chuột, bút, ngón tay), lưu nét theo toạ độ
// 0..1 của ô vuông để không phụ thuộc kích thước hiển thị / DPR. Nét mẫu (nếu có) vẽ mờ phía dưới
// kèm số thứ tự để người học tô theo. Không gọi mạng; chấm điểm do KanjiWritePanel lo.

export interface CanvasPoint extends Point {
    /** ms kể từ lúc chạm nét đầu tiên. */
    t: number;
}

export interface CanvasStroke {
    points: CanvasPoint[];
}

export interface KanjiCanvasProps {
    /** Cạnh ô vuông theo px CSS. */
    size?: number;
    /** Nét mẫu [[ [x, y], ... ], ...] toạ độ 0..1; null = chưa có dữ liệu. */
    reference?: number[][][] | null;
    showReference?: boolean;
    disabled?: boolean;
    onChange?: (strokes: CanvasStroke[]) => void;
}

// Màu lấy theo token Tailwind (canvas không dùng được class): primary, outline-variant, surface-container-high, outline.
const COLOR_USER = "#041534";
const COLOR_REF = "#c5c6cf";
const COLOR_GRID = "#dce9ff";
const COLOR_NUMBER = "#75777f";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const KanjiCanvas: React.FC<KanjiCanvasProps> = ({ size = 280, reference = null, showReference = true, disabled = false, onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
    // Bản sao đồng bộ của state để handler pointer / vẽ đọc được giá trị mới nhất không qua closure cũ.
    const strokesRef = useRef<CanvasStroke[]>([]);
    const currentRef = useRef<CanvasPoint[]>([]);
    const pointerIdRef = useRef<number | null>(null);
    const t0Ref = useRef<number | null>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(size * dpr)) {
            canvas.width = Math.round(size * dpr);
            canvas.height = Math.round(size * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Lưới chữ thập đứt nét như vở tập viết: giúp căn chữ vào giữa ô.
        ctx.strokeStyle = COLOR_GRID;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(size / 2, 0);
        ctx.lineTo(size / 2, size);
        ctx.moveTo(0, size / 2);
        ctx.lineTo(size, size / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const lineWidth = Math.max(3, size * 0.03);
        if (showReference && reference && reference.length > 0) {
            // Nét mẫu đã chuẩn hoá cạnh dài = 1 nên luôn có nét chạm mép ô (nét 1 của 一, 日, 王...): vẽ lùi
            // vào một lề để nét không bị cắt nửa và còn chỗ ghi số thứ tự phía trên / bên phải điểm bắt đầu.
            // Chỉ ảnh hưởng hiển thị: nét người vẽ được chuẩn hoá lại theo khung của chính nó trước khi chấm.
            const pad = lineWidth + 8;
            const inset = (v: number) => pad + v * (size - 2 * pad);
            ctx.strokeStyle = COLOR_REF;
            ctx.lineWidth = lineWidth;
            reference.forEach((stroke) => {
                if (stroke.length === 0) return;
                ctx.beginPath();
                stroke.forEach(([x, y], i) => {
                    if (i === 0) ctx.moveTo(inset(x), inset(y));
                    else ctx.lineTo(inset(x), inset(y));
                });
                if (stroke.length === 1) ctx.lineTo(inset(stroke[0][0]), inset(stroke[0][1]));
                ctx.stroke();
            });
            // Số thứ tự đặt cạnh điểm bắt đầu để thấy cả thứ tự lẫn hướng nét; kẹp vào trong ô để số của
            // nét bắt đầu sát mép trên / phải không rơi ra ngoài bitmap.
            const fontPx = Math.max(10, size * 0.045);
            ctx.fillStyle = COLOR_NUMBER;
            ctx.font = `600 ${fontPx}px 'Plus Jakarta Sans', sans-serif`;
            ctx.textBaseline = "middle";
            reference.forEach((stroke, i) => {
                if (stroke.length === 0) return;
                const [x, y] = stroke[0];
                const label = String(i + 1);
                const labelWidth = ctx.measureText(label).width;
                ctx.fillText(
                    label,
                    Math.min(size - labelWidth - 2, inset(x) + 4),
                    Math.max(fontPx / 2 + 1, Math.min(size - fontPx / 2 - 1, inset(y) - 6))
                );
            });
        }

        ctx.strokeStyle = COLOR_USER;
        ctx.lineWidth = lineWidth;
        const paint = (pts: CanvasPoint[]) => {
            if (pts.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(pts[0].x * size, pts[0].y * size);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * size, pts[i].y * size);
            if (pts.length === 1) ctx.lineTo(pts[0].x * size, pts[0].y * size);
            ctx.stroke();
        };
        strokesRef.current.forEach((s) => paint(s.points));
        paint(currentRef.current);
    }, [size, reference, showReference]);

    useEffect(() => {
        draw();
    }, [draw, strokes]);

    const commit = (next: CanvasStroke[]) => {
        strokesRef.current = next;
        setStrokes(next);
        onChange?.(next);
    };

    const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
        const canvas = e.currentTarget;
        // Bitmap nằm trong content box, còn getBoundingClientRect() là border-box (canvas có border-2 và
        // box-sizing border-box): phải trừ viền và chia cho clientWidth, nếu không mực lệch lên / sang trái
        // một bề dày viền và bị co 276/280 -> thấy rõ khi vẽ sát mép.
        const rect = canvas.getBoundingClientRect();
        if (t0Ref.current === null) t0Ref.current = performance.now();
        return {
            x: clamp01((e.clientX - rect.left - canvas.clientLeft) / (canvas.clientWidth || size)),
            y: clamp01((e.clientY - rect.top - canvas.clientTop) / (canvas.clientHeight || size)),
            t: Math.round(performance.now() - t0Ref.current),
        };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled || pointerIdRef.current !== null) return; // ngón tay thứ hai: bỏ qua
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pointerIdRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        currentRef.current = [toPoint(e)];
        draw();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (pointerIdRef.current !== e.pointerId) return;
        const p = toPoint(e);
        const last = currentRef.current[currentRef.current.length - 1];
        // Bỏ điểm rung dưới 1px để nét gọn và mảng điểm không phình to.
        if (last && Math.hypot((p.x - last.x) * size, (p.y - last.y) * size) < 1) return;
        currentRef.current.push(p);
        draw();
    };

    const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (pointerIdRef.current !== e.pointerId) return;
        pointerIdRef.current = null;
        const pts = currentRef.current;
        currentRef.current = [];
        if (pts.length > 0) commit([...strokesRef.current, { points: pts }]);
        else draw();
    };

    const undo = () => {
        if (strokesRef.current.length === 0) return;
        commit(strokesRef.current.slice(0, -1));
    };

    const clear = () => {
        if (strokesRef.current.length === 0) return;
        t0Ref.current = null;
        commit([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
    };

    const count = strokes.length;

    return (
        <div className="inline-flex flex-col items-center gap-2" onKeyDown={handleKeyDown}>
            <canvas
                ref={canvasRef}
                role="img"
                tabIndex={0}
                aria-label={`Ô viết chữ. Dùng chuột, bút hoặc ngón tay vẽ từng nét theo đúng thứ tự; ${
                    count === 0 ? "chưa có nét nào" : `đã vẽ ${count} nét`
                }. Ctrl+Z để hoàn tác nét vừa vẽ.`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                onLostPointerCapture={finishStroke}
                onContextMenu={(e) => e.preventDefault()}
                style={{ width: size, height: size }}
                className={`touch-none select-none rounded-2xl border-2 bg-surface-container-lowest shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    disabled ? "border-surface-container-high cursor-not-allowed opacity-70" : "border-outline-variant cursor-crosshair"
                }`}
            />
            <div className="flex items-center gap-2" style={{ width: size }}>
                {/* Vùng live: báo số nét cho trình đọc màn hình mỗi khi vẽ / hoàn tác / xoá. */}
                <p aria-live="polite" className="flex-1 text-label-md text-on-surface-variant">
                    {count === 0 ? "Chưa có nét nào" : `Đã vẽ ${count} nét`}
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={disabled || count === 0} title="Hoàn tác nét vừa vẽ (Ctrl+Z)">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                        undo
                    </span>
                    Hoàn tác
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || count === 0} title="Xoá toàn bộ nét đã vẽ">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                        ink_eraser
                    </span>
                    Xoá
                </Button>
            </div>
        </div>
    );
};
