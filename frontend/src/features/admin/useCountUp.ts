import { useState, useEffect, useRef } from "react";

/**
 * Hook đếm số tăng dần nhẹ nhàng bằng requestAnimationFrame (mặc định 600ms).
 * Chỉ chạy animation lần đầu khi mount/nhận giá trị; tôn trọng prefers-reduced-motion.
 */
export const useCountUp = (target: number, durationMs = 600): number => {
  const [displayValue, setDisplayValue] = useState(target);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !isFirstRun.current || !Number.isFinite(target) || target <= 0) {
      setDisplayValue(target);
      return;
    }

    isFirstRun.current = false;
    let startTimestamp: number | null = null;
    let animId: number;

    const step = (now: number) => {
      if (!startTimestamp) startTimestamp = now;
      const elapsed = now - startTimestamp;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(target * ease);
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
      }
    };

    animId = requestAnimationFrame(step);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [target, durationMs]);

  return displayValue;
};
