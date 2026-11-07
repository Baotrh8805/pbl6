import { useRef, useState, type PointerEvent } from "react";
import { swipeDecision } from "@/features/study/studyUtils";

interface Drag {
    id: number;
    x: number;
    y: number;
    width: number;
    /** null = chưa đủ 8px để biết người dùng kéo ngang hay cuộn dọc. */
    horizontal: boolean | null;
}

/**
 * Vuốt thẻ trên màn hình cảm ứng (spec 25/10 §3.6): chỉ touch / pen (chuột vẫn bôi đen chữ được). Phần tử dùng
 * `touch-action: pan-y` để trình duyệt vẫn cuộn dọc; kéo ngang thì thẻ đi theo ngón tay, thả quá ngưỡng thì gọi onSwipe.
 */
export function useSwipe(enabled: boolean, onSwipe: (grade: "again" | "good") => void) {
    const [dx, setDx] = useState(0);
    const drag = useRef<Drag | null>(null);
    // Vừa kéo ngang: trình duyệt vẫn có thể bắn click khi thả tay -> bấm-để-lật bỏ qua đúng một click đó.
    const dragged = useRef(false);

    const reset = () => {
        drag.current = null;
        setDx(0);
    };

    const handlers = {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
            if (!enabled || e.pointerType === "mouse" || !e.isPrimary) return;
            dragged.current = false;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, horizontal: null };
        },
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.id) return;
            const mx = e.clientX - d.x;
            if (d.horizontal === null) {
                const my = e.clientY - d.y;
                if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
                d.horizontal = Math.abs(mx) > Math.abs(my);
                if (!d.horizontal) return;
                dragged.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
            }
            if (d.horizontal) setDx(mx);
        },
        onPointerUp: (e: PointerEvent<HTMLElement>) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.id) return;
            const decision = d.horizontal ? swipeDecision(e.clientX - d.x, d.width) : null;
            reset();
            if (decision) onSwipe(decision);
        },
        onPointerCancel: reset,
    };

    /** true nếu cú click đang xử lý là đuôi của một lần kéo ngang (đọc xong thì xoá). */
    const consumeDrag = () => {
        const was = dragged.current;
        dragged.current = false;
        return was;
    };

    return { dx: enabled ? dx : 0, handlers, consumeDrag };
}
