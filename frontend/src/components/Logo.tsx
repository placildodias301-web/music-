export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, var(--color-ns-coral-soft), var(--color-ns-coral))",
          boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset",
        }}
      >
        <img src="/wilsify-logo.svg" alt="" width={size * 0.6} height={size * 0.6} />
      </div>
      {withText && (
        <span className="font-heading text-lg font-bold tracking-tight text-content">
          Wilsify AI
        </span>
      )}
    </div>
  );
}
