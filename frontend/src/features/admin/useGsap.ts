import { useEffect, type DependencyList, type RefObject } from "react";
import gsap from "gsap";

/**
 * Hook bọc gsap.context() an toàn bộ nhớ trong React 19 / StrictMode.
 * Tự động revert() toàn bộ animation khi unmount hoặc dependency thay đổi.
 * Tự động bỏ qua animation nếu người dùng bật prefers-reduced-motion.
 */
export const useGsap = (
  scopeRef: RefObject<HTMLElement | SVGSVGElement | null>,
  animationFn: (context: gsap.Context) => void,
  deps: DependencyList = [],
): void => {
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !scopeRef.current) return;

    // gsap gọi callback NGAY trong constructor của Context, trước khi `const ctx` được gán -> đọc `ctx` trong callback
    // ném ReferenceError (TDZ) và React gỡ cả cây (trang /admin trắng). Dùng Context mà gsap truyền vào làm đối số đầu.
    const ctx = gsap.context((self: gsap.Context) => {
      animationFn(self);
    }, scopeRef);

    return () => {
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
