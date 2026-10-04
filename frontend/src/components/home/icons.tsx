import type { ReactNode } from "react";
import { ICON_PATHS } from "./iconPaths";

export { ICON_PATHS };

/** Decorative inline icon (24×24 grid). Always aria-hidden — label the parent control instead. */
export function Icon({ children, size = 18, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const ICON = ICON_PATHS;
