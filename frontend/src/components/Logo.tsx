export function Logo({
  size = 32,
  withText = true,
  subtitle,
}: {
  size?: number;
  withText?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-xl shadow-lg transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #6C4DFF 0%, #8B5CF6 100%)",
          boxShadow: "0 4px 16px -2px rgba(108, 77, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
        }}
      >
        <svg
          width={size * 0.58}
          height={size * 0.58}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 10v4" />
          <path d="M8 6v12" />
          <path d="M12 3v18" />
          <path d="M16 7v10" />
          <path d="M20 11v2" />
        </svg>
      </div>
      {withText && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-heading text-[1.125rem] font-extrabold tracking-tight text-[var(--color-ns-text)]">
              Wilsify
            </span>
            <span className="rounded-md bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] px-1.5 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-white shadow-sm">
              AI
            </span>
          </div>
          {subtitle && (
            <p className="truncate text-[0.625rem] font-medium text-[var(--color-ns-muted)]">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
