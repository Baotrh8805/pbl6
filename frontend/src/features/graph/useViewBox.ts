import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { clientToDiagram, panViewBox, zoomViewBox, type DiagramPoint, type DiagramViewBox } from "@/features/graph/diagramLayout";

const WHEEL_STEP = 1.12;   // mỗi nấc cuộn chuột
const BUTTON_STEP = 1.4;   // nút + / −

/**
 * Zoom / pan khung nhìn SVG của sơ đồ chữ Hán (spec 2026-10-30 đợt 2.1): cuộn chuột phóng quanh con trỏ, kéo nền để pan,
 * nút + − ⤢ và phím + − 0. Không thêm thư viện. Khung "vừa sơ đồ" (`base`) đổi (dữ liệu mới) thì về khung đó — trạng thái gắn
 * với khoá của base nên không cần setState trong effect. Wheel gắn bằng addEventListener không passive để chặn cuộn trang.
 */
export function useViewBox(base: DiagramViewBox, svgRef: RefObject<SVGSVGElement | null>) {
    const baseKey = `${base.x}|${base.y}|${base.w}|${base.h}`;
    const [state, setState] = useState<{ key: string; vb: DiagramViewBox } | null>(null);
    const view = state && state.key === baseKey ? state.vb : base;
    const viewRef = useRef(view);
    useEffect(() => {
        viewRef.current = view;
    });
    const isFit = view === base;

    const set = (vb: DiagramViewBox) => setState({ key: baseKey, vb });
    const zoomAt = (factor: number, focus: DiagramPoint) => set(zoomViewBox(viewRef.current, factor, focus, base));
    const centre = (): DiagramPoint => ({ x: viewRef.current.x + viewRef.current.w / 2, y: viewRef.current.y + viewRef.current.h / 2 });
    const zoomIn = () => zoomAt(BUTTON_STEP, centre());
    const zoomOut = () => zoomAt(1 / BUTTON_STEP, centre());
    const fit = () => setState(null);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
            const focus = clientToDiagram(svg.getBoundingClientRect(), viewRef.current, e.clientX, e.clientY);
            setState({ key: baseKey, vb: zoomViewBox(viewRef.current, factor, focus, base) });
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
        // base đổi → đăng ký lại để closure thấy base mới (giới hạn zoom tính theo base)
    }, [svgRef, baseKey, base]);

    // kéo nền: chỉ khi bấm vào chính <svg> (không phải node); node tự xử lý kéo của nó và stopPropagation.
    // Hai ngón trên màn hình cảm ứng: pinch = zoom quanh điểm giữa hai ngón (theo dõi mọi con trỏ đang chạm).
    const pan = useRef<{ id: number; x: number; y: number; vb: DiagramViewBox; moved: boolean } | null>(null);
    const touches = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ dist: number } | null>(null);
    const [panning, setPanning] = useState(false);
    const panHandlers = {
        onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
            if (e.button !== 0) return;
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            e.currentTarget.setPointerCapture(e.pointerId);
            if (touches.current.size === 2) {
                const [a, b] = [...touches.current.values()];
                pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
                pan.current = null;
                return;
            }
            if (!e.isPrimary) return;
            pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vb: viewRef.current, moved: false };
        },
        onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
            if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && touches.current.size >= 2) {
                const [a, b] = [...touches.current.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                const factor = dist / pinch.current.dist;
                pinch.current.dist = dist;
                const mid = clientToDiagram(e.currentTarget.getBoundingClientRect(), viewRef.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
                zoomAt(factor, mid);
                return;
            }
            const p = pan.current;
            if (!p || e.pointerId !== p.id) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const scale = Math.min(rect.width / p.vb.w, rect.height / p.vb.h) || 1;
            const dx = (e.clientX - p.x) / scale;
            const dy = (e.clientY - p.y) / scale;
            if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
            if (!p.moved) {
                p.moved = true;
                setPanning(true);
            }
            set(panViewBox(p.vb, dx, dy));
        },
        onPointerUp: (e: PointerEvent<SVGSVGElement>) => {
            touches.current.delete(e.pointerId);
            if (touches.current.size < 2) pinch.current = null;
            if (pan.current && e.pointerId === pan.current.id) {
                pan.current = null;
                setPanning(false);
            }
        },
        onPointerCancel: (e: PointerEvent<SVGSVGElement>) => {
            touches.current.delete(e.pointerId);
            pinch.current = null;
            pan.current = null;
            setPanning(false);
        },
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoomIn();
        } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            zoomOut();
        } else if (e.key === "0") {
            e.preventDefault();
            fit();
        }
    };

    return { view, isFit, zoomIn, zoomOut, fit, panHandlers, panning, onKeyDown };
}
