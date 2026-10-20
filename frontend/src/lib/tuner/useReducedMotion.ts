import { useEffect, useState } from "react";

/** True when the OS or Wilsify's Settings ask for reduced motion. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const read = () => window.matchMedia(query).matches || document.documentElement.dataset.reduceMotion === "true";
  const [reduce, setReduce] = useState(read);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduce(read());
    mql.addEventListener("change", onChange);
    const obs = new MutationObserver(onChange);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    return () => {
      mql.removeEventListener("change", onChange);
      obs.disconnect();
    };
  }, []);
  return reduce;
}
