import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";
import { formatMinutes, type DayStat } from "./homeUtils";
import { useSettings } from "../../lib/settings/settingsContext";

interface PracticeWeekCardProps {
  week: DayStat[];
  weekSeconds: number;
  streak: number;
  xp: number;
  hasAnyPractice: boolean;
}

function StatItem({
  label,
  value,
  subtext,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  subtext: string;
  iconBg: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg} shadow-sm`}>
          {icon}
        </span>
        <span className="text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">{label}</span>
      </div>
      <p className="mt-2 font-heading text-xl font-extrabold text-[var(--color-ns-text)]">{value}</p>
      <p className="text-[0.6875rem] text-[var(--color-ns-dim)]">{subtext}</p>
    </div>
  );
}

export function PracticeWeekCard({ week, weekSeconds, streak, xp, hasAnyPractice }: PracticeWeekCardProps) {
  // Always the user's real numbers — a new account shows zeros, not sample data.
  const displayMinutes = formatMinutes(weekSeconds);
  const displayStreak = `${streak} ${streak === 1 ? "day" : "days"}`;
  const displayXp = `${xp} XP`;

  const max = Math.max(...week.map((d) => d.seconds), 60);

  // Daily goal from Settings → Practice, measured from today's real sessions.
  const { settings } = useSettings();
  const goal = settings.practice.dailyGoalMinutes;
  const todayMinutes = Math.floor((week.find((d) => d.isToday)?.seconds ?? 0) / 60);
  const goalPct = Math.min(100, Math.round((todayMinutes / goal) * 100));

  return (
    <section aria-labelledby="practice-week-title" className="ns-card flex h-full flex-col justify-between p-5 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)] shadow-inner">
              <Icon size={19}>{ICON.flame}</Icon>
            </span>
            <div>
              <h2 id="practice-week-title" className="font-heading text-base font-bold text-[var(--color-ns-text)]">
                Your Practice This Week
              </h2>
              <p className="text-xs text-[var(--color-ns-muted)]">
                {!hasAnyPractice ? "No practice logged yet — your week fills in here." : weekSeconds > 0 ? "Keep going. You're doing great!" : "Nothing yet this week — pick up where you left off."}
              </p>
            </div>
          </div>
          <Link to="/dashboard" className="text-[var(--color-ns-dim)] transition-colors hover:text-[var(--color-ns-purple-light)]">
            <Icon size={16}>{ICON.arrowRight}</Icon>
          </Link>
        </div>

        {/* 3 Metric Columns matching reference screenshot */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-b border-[var(--color-ns-border)]/70 pb-5">
          <StatItem
            label="Total practice"
            value={displayMinutes}
            subtext="this week"
            iconBg="bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-purple-light)]"
            icon={<Icon size={14}>{ICON.clock}</Icon>}
          />
          <StatItem
            label="Streak"
            value={displayStreak}
            subtext="consecutive"
            iconBg="bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)]"
            icon={<Icon size={14}>{ICON.flame}</Icon>}
          />
          <StatItem
            label="Total XP"
            value={displayXp}
            subtext="mastery level"
            iconBg="bg-[var(--color-ns-red)]/20 text-[var(--color-ns-red)]"
            icon={<Icon size={14}>{ICON.star}</Icon>}
          />
        </div>
      </div>

      {/* Today's goal */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[0.7188rem]">
          <span className="font-semibold text-[var(--color-ns-muted)]">Today's goal</span>
          <span className="font-mono tabular-nums text-[var(--color-ns-text)]">
            {todayMinutes} / {goal} min{todayMinutes >= goal ? " ✓" : ""}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-ns-border)]"
          role="progressbar"
          aria-label="Today's practice goal"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(todayMinutes, goal)}
        >
          <div className={`h-full rounded-full ${todayMinutes >= goal ? "bg-[var(--color-ns-mint)]" : "bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-violet-soft)]"}`} style={{ width: `${goalPct}%` }} />
        </div>
      </div>

      {/* Purple Gradient Weekly Bar Chart */}
      <div className="my-5">
        <div className="flex h-28 items-end justify-between gap-2.5 px-1" role="img" aria-label="Practice minutes per day">
          {week.map((day) => {
            const pct = day.seconds > 0 ? Math.max(15, Math.round((day.seconds / max) * 100)) : 0;
            const isHighlight = day.isToday && day.seconds > 0;

            return (
              <div key={day.label} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className={`w-full max-w-[24px] rounded-t-md transition-all duration-300 ${
                      pct === 0
                        ? "bg-[var(--color-ns-border)]"
                        : isHighlight
                        ? "bg-gradient-to-t from-[var(--color-ns-purple)] to-[var(--color-violet-soft)] shadow-[0_0_14px_rgba(108,77,255,0.65)]"
                        : "bg-gradient-to-t from-[#3B28A8]/60 to-[var(--color-ns-purple)]/80 group-hover:from-[#4F35DE] group-hover:to-[var(--color-ns-purple-light)]"
                    }`}
                    style={{ height: pct === 0 ? "4px" : `${pct}%` }}
                    title={`${day.label}: ${formatMinutes(day.seconds)}`}
                  />
                </div>
                <span className={`text-[0.6875rem] font-semibold ${day.isToday ? "text-[var(--color-ns-text)]" : "text-[var(--color-ns-muted)]"}`}>
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next step: start practising, or see the full history */}
      <Link
        to={hasAnyPractice ? "/dashboard" : "/practice"}
        className="flex items-center justify-between rounded-xl border border-[var(--color-ns-mint)]/30 bg-[var(--color-ns-mint)]/10 px-3.5 py-2.5 text-xs font-bold text-[var(--color-ns-mint)] transition-all hover:bg-[var(--color-ns-mint)]/15 hover:border-[var(--color-ns-mint)]/50"
      >
        <span>{hasAnyPractice ? "See your progress" : "Start your first practice session"}</span>
        <Icon size={14}>{ICON.arrowRight}</Icon>
      </Link>
    </section>
  );
}
