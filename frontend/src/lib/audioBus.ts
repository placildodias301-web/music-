import { useEffect, useRef } from "react";

/** Only one player on the page should make sound at a time. Players announce themselves here. */
const bus = new EventTarget();

export function announcePlay(id: string) {
  bus.dispatchEvent(new CustomEvent("play", { detail: id }));
}

/** Calls `stop` whenever some OTHER player starts. */
export function useStopWhenOthersPlay(id: string, stop: () => void) {
  const cb = useRef(stop);
  useEffect(() => {
    cb.current = stop;
  });
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) cb.current();
    };
    bus.addEventListener("play", h);
    return () => bus.removeEventListener("play", h);
  }, [id]);
}
