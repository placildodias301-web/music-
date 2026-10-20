import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Keeps a floating menu glued to its trigger. While `active`, the trigger's rect is
 * re-measured on every scroll (of the page or any scroll container) and resize, and
 * handed to `onRect`. If the trigger scrolls completely out of view, `onGone` fires
 * so the menu can close instead of floating over unrelated content.
 */
export function useFollowAnchor(active: boolean, ref: RefObject<HTMLElement | null>, onRect: (r: DOMRect) => void, onGone: () => void) {
  const rectCb = useRef(onRect);
  const goneCb = useRef(onGone);
  useEffect(() => {
    rectCb.current = onRect;
    goneCb.current = onGone;
  });

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
        goneCb.current();
        return;
      }
      rectCb.current(r);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, ref]);
}
