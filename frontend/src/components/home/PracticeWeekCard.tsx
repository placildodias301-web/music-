import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";
import { formatMinutes, type DayStat } from "./homeUtils";

interface PracticeWeekCardProps {
  week: DayStat[];
  weekSeconds: number;
  streak: number;
  xp: number;
  /** True when at least one session has ever been logged on this device. */
  hasAnyPractice: boolean;
}

function Stat({ label, value, caption, icon }: { label: string; value: string; caption: string; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-ns-border bg-ns-bg-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-ns-amber">
        <Icon size={13}>{icon}</Icon>
        <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.1em] text-ns-muted">{label}</span>
      </div>
      <p className="mt-1 truncate font-heading text-lg font-bold text-ns-text">{value}</p>
      <p className="truncate text-[11px] text-ns-muted/80">{caption}</p>
    </div>
  );
}

function WeekChart({ week, empty }: { week: DayStat[]; empty: boolean }) {
  const max = Math.max(...week.map((d) => d.seconds), 60);
  const summary = week.map((d) => `${d.label} ${Math.round(d.seconds / 60)} min`).join(", ");

  return (
    <div className="flex h-[120px] items-end justify-between gap-2" role="img" aria-label={`Practice minutes this week: ${summary}`}>
      {week.map((day) => {
        const pct = day.seconds > 0 ? Math.max(10, Math.round((day.seconds / max) * 100)) : 6;
        return (
          <div key={day.label} className="group relative flex h-full flex-1 flex-col items-center gap-2">
            {day.seconds > 0 && (
              <span className="pointer-events-none absolute -top-6 z-10 hidden whitespace-nowrap rounded-md border border-ns-border bg-ns-raised px-1.5 py-0.5 font-mono text-[10px] text-ns-text group-hover:block">
                {formatMinutes(day.seconds)}
              </span>
            )}
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className={`w-full max-w-[22px] rounded-[5px] transition-all duration-300 ${
                  day.seconds > 0
                    ? day.isToday
                      ? "bg-ns-amber"
                      : "bg-ns-amber/55 group-hover:bg-ns-amber/75"
                    : day.isFuture || empty
                      ? "bg-white/[0.04]"
                      : "bg-white/[0.07]"
                } ${day.isToday && day.seconds === 0 ? "ring-1 ring-ns-amber/50" : ""}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span
              className={`text-[11px] ${day.isToday ? "font-bold text-ns-amber" : "font-medium text-ns-muted/80"}`}
              aria-current={day.isToday ? "date" : undefined}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PracticeWeekCard({ week, weekSeconds, streak, xp, hasAnyPractice }: PracticeWeekCardProps) {
  const activeDays = week.filter((d) => d.seconds > 0).length;

  return (
    <section aria-labelledby="practice-week-title" className="ns-card flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="practice-week-title" className="font-heading text-base font-bold text-ns-text">
            Your Practice This Week
          </h2>
          <p className="mt-0.5 text-[13px] text-ns-muted">
            Keep going. You're doing great!
          </p>
        </div>
        {hasAnyPractice && (
          <Link to="/dashboard" className="ns-link flex-shrink-0">
            Progress
            <Icon size={14}>{ICON.arrowRight}</Icon>
          </Link>
        )}
      </div>

      {hasAnyPractice ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat
              label="Total Practice"
              value={formatMinutes(weekSeconds)}
              caption={`${activeDays} ${activeDays === 1 ? "day" : "days"} this week`}
              icon={ICON.clock}
            />
            <Stat label="Streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} caption="in a row" icon={ICON.flame} />
            <Stat label="XP" value={xp.toLocaleString()} caption="all time" icon={ICON.star} />
          </div>
          <div className="mt-6 flex-1">
            <WeekChart week={week} empty={false} />
          </div>
        </>
      ) : (
        <div className="mt-5 flex flex-1 flex-col">
          <div className="flex items-center gap-3.5 rounded-xl border border-dashed border-ns-border bg-ns-bg-2/60 p-4">
            <span className="ns-icon-tile ns-accent-amber">
              <Icon size={19}>{ICON.metronome}</Icon>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ns-text">No practice logged yet</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ns-muted">
                Time, streak and XP are tracked automatically when you practise.
              </p>
            </div>
          </div>
          <div className="mt-5 flex-1 opacity-80">
            <WeekChart week={week} empty />
          </div>
          <Link
            to="/practice"
            className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-ns-amber/30 bg-ns-amber/10 px-4 text-sm font-bold text-ns-amber transition-colors hover:bg-ns-amber/15"
          >
            Start your first session
            <Icon size={15}>{ICON.arrowRight}</Icon>
          </Link>
        </div>
      )}
    </section>
  );
}
