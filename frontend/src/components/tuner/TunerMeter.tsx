import { useEffect, useRef } from "react";
import { GAUGE_RANGE_CENTS, IN_TUNE_CENTS } from "../../lib/tuner/cents";
import { TUNER_CONFIG } from "../../lib/tuner/config";
import { smoothToward } from "../../lib/tuner/needle";
import { useReducedMotion } from "../../lib/tuner/useReducedMotion";

/**
 * Half-circle cents gauge (−range…+range) with in-tune and close zones. `cents` is the real error against the target:
 * the needle is drawn at its clamped position and eased toward it in time (exponential, `needleTauMs`); `outOfRange` adds a
 * quiet marker at the end the needle is pinned to.
 */
export function TunerMeter({ cents, active, held, color, isFlat, isSharp, outOfRange = 0 }: { cents: number; active: boolean; held: boolean; color: string; isFlat: boolean; isSharp: boolean; outOfRange?: -1 | 0 | 1 }) {
  const R = 84;
  const RANGE = GAUGE_RANGE_CENTS;
  const reduceMotion = useReducedMotion();
  const needleRef = useRef<SVGLineElement>(null);
  const shown = useRef(0);
  const point = (c: number, r: number) => {
    const a = ((c * 90) / RANGE - 90) * (Math.PI / 180); // ±range cents → ±90°
    return [100 + r * Math.cos(a), 104 + r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from, R);
    const [x2, y2] = point(to, R);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const aim = active ? Math.max(-RANGE, Math.min(RANGE, cents)) : 0;
  const aimRef = useRef(aim);
  aimRef.current = aim;

  // Time-based easing, off React's render path: the needle glides toward the latest reading every animation frame.
  useEffect(() => {
    const line = needleRef.current;
    if (!line) return;
    let raf = 0;
    let last = performance.now();
    const place = (c: number) => {
      const [x, y] = point(c, R - 12);
      line.setAttribute("x2", x.toFixed(2));
      line.setAttribute("y2", y.toFixed(2));
    };
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const next = smoothToward(shown.current, aimRef.current, dt, reduceMotion ? 0 : TUNER_CONFIG.needleTauMs);
      shown.current = Math.abs(next - aimRef.current) < 0.02 ? aimRef.current : next;
      place(shown.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);
  const [nx, ny] = point(shown.current, R - 12);

  return (
    <div className="relative mx-auto flex max-w-sm items-end justify-between gap-1">
      <span
        aria-hidden="true"
        className="mb-6 w-8 text-center font-heading text-3xl font-bold transition-colors"
        style={{ color: isFlat ? color : "var(--color-ns-border-strong)" }}
      >
        ♭
      </span>
      <svg viewBox="0 0 200 118" className="w-full max-w-[18rem]" role="img" aria-label={active ? `${Math.round(cents)} cents from target` : "No pitch yet"}>
        <path d={arc(-50, 50)} fill="none" stroke="var(--color-ns-border)" strokeWidth={10} strokeLinecap="round" />
        <path d={arc(-15, 15)} fill="none" stroke="var(--color-ns-amber)" strokeOpacity={0.35} strokeWidth={10} />
        <path d={arc(-IN_TUNE_CENTS, IN_TUNE_CENTS)} fill="none" stroke="var(--color-ns-mint)" strokeWidth={10} />
        {outOfRange !== 0 && <path d={outOfRange < 0 ? arc(-RANGE, -RANGE + 8) : arc(RANGE - 8, RANGE)} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={10} strokeLinecap="round" />}
        {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
          const major = c % 25 === 0 || c === 0;
          const [x1, y1] = point(c, R - 9);
          const [x2, y2] = point(c, R - (major ? 18 : 14));
          return <line key={c} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ns-border-strong)" strokeWidth={major ? 1.6 : 1} />;
        })}
        {[-50, -25, 25, 50].map((c) => {
          const [x, y] = point(c, R - 27);
          return (
            <text key={c} x={x} y={y + 3} textAnchor="middle" fontSize={8} fill="var(--color-ns-dim)" fontFamily="ui-monospace, monospace">
              {c > 0 ? `+${c}` : c}
            </text>
          );
        })}
        <line
          ref={needleRef}
          x1={100}
          y1={104}
          x2={nx}
          y2={ny}
          stroke={active ? color : "var(--color-ns-border-strong)"}
          strokeOpacity={held ? 0.5 : 1}
          strokeWidth={3.5}
          strokeLinecap="round"
          style={{ transition: reduceMotion ? "none" : "stroke 200ms" }}
        />
        <circle cx={100} cy={104} r={6} fill={active ? color : "var(--color-ns-border-strong)"} />
      </svg>
      <span
        aria-hidden="true"
        className="mb-6 w-8 text-center font-heading text-3xl font-bold transition-colors"
        style={{ color: isSharp ? color : "var(--color-ns-border-strong)" }}
      >
        ♯
      </span>
    </div>
  );
}

/** Live input meter, so "nothing happens" can be told apart from "the mic hears nothing". */
export function MicLevel({ level, quiet }: { level: number; quiet: boolean }) {
  // RMS 0.003…0.3 mapped onto 0…100% on a log scale (how loud it feels).
  const pct = Math.max(0, Math.min(100, ((Math.log10(Math.max(level, 0.003)) + 2.5) / 2) * 100));
  return (
    <div className="relative mx-auto mt-3 flex max-w-xs items-center gap-2.5">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">Mic</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-ns-raised)]" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${pct}%`, background: quiet ? "var(--color-ns-red)" : "var(--color-ns-mint)" }}
        />
      </div>
    </div>
  );
}
