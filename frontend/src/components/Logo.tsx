export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
          boxShadow: "0 0 20px rgba(124,92,255,0.4)",
        }}
      >
        <img src="/wilsify-logo.svg" alt="" width={size * 0.6} height={size * 0.6} />
      </div>
      <span className="font-heading text-lg font-bold tracking-tight text-content">
        Wilsify AI
      </span>
    </div>
  );
}
