import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { getLibrary, type SavedAnalysis } from "../lib/library";
import {
  getAllSessions,
  getStreakDays,
  getTotalXp,
  getTotalPracticeSeconds,
} from "../lib/practiceLog";
import { currentWeek } from "../components/home/homeUtils";
import { AnalyzeHero } from "../components/home/AnalyzeHero";
import { PracticeWeekCard } from "../components/home/PracticeWeekCard";
import { RecentAnalyses } from "../components/home/RecentAnalyses";
import { QuickTools } from "../components/home/QuickTools";
import { BottomBanner } from "../components/home/BottomBanner";
import type { UploadLocationState } from "./Upload";

export function Studio() {
  const navigate = useNavigate();
  const { analysis, fileName, setSong, setAnalysis } = useMvp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute real dashboard data from browser-persisted state
  const data = useMemo(() => {
    const library = getLibrary();
    const sessions = getAllSessions();
    const week = currentWeek(sessions);
    const weekSeconds = week.reduce((sum, d) => sum + d.seconds, 0);
    const streak = getStreakDays();
    const xp = getTotalXp();
    const totalPracticeSeconds = getTotalPracticeSeconds();

    return {
      library,
      recent: library.slice(0, 3),
      week,
      weekSeconds,
      streak,
      xp,
      totalPracticeSeconds,
      hasAnyPractice: sessions.length > 0,
    };
  }, []);

  function handOff(state: UploadLocationState) {
    navigate("/upload", { state });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handOff({ file });
      e.target.value = "";
    }
  }

  function openSaved(item: SavedAnalysis) {
    setSong({
      fileName: item.fileName,
      fileSizeBytes: 0,
      audioUrl: null,
      isSampleAudio: false,
    });
    setAnalysis(item.analysis);
    navigate("/analysis");
  }

  const [mobileQuery, setMobileQuery] = useState("");

  function handleMobileSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = mobileQuery.trim();
    if (!trimmed) return;
    navigate(`/library?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7 md:px-8 space-y-6">
      {/* Hidden file input for native file dialog triggered by "Upload Song" or drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Mobile search bar (desktop uses header search) */}
      <form onSubmit={handleMobileSearch} role="search" className="lg:hidden">
        <label className="ns-input">
          <span className="text-[#A5B1CC]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={mobileQuery}
            onChange={(e) => setMobileQuery(e.target.value)}
            aria-label="Search songs, chords, or questions"
            placeholder="Search songs, chords, or questions…"
            className="w-full bg-transparent text-[13px] text-[#F4F6FF] placeholder:text-[#687797] focus:outline-none"
          />
        </label>
      </form>

      {/* 1. TOP ROW: HERO (Left) & YOUR PRACTICE THIS WEEK (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
          <AnalyzeHero
            onPickFile={() => fileInputRef.current?.click()}
            onDropFile={(file) => handOff({ file })}
            onTrySample={() => handOff({ sample: true })}
            analysis={analysis}
            fileName={fileName}
          />
        </div>

        <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
          <PracticeWeekCard
            week={data.week}
            weekSeconds={data.weekSeconds}
            streak={data.streak}
            xp={data.xp}
            hasAnyPractice={data.hasAnyPractice}
          />
        </div>
      </div>

      {/* 2. SECOND ROW: RECENT ANALYSES (Left) & QUICK TOOLS (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-7 xl:col-span-8">
          <RecentAnalyses
            items={data.recent}
            totalCount={data.library.length}
            onOpenItem={openSaved}
          />
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          <QuickTools />
        </div>
      </div>

      {/* 3. THIRD ROW: FULL-WIDTH BOTTOM PRACTICE BANNER */}
      <BottomBanner />
    </div>
  );
}
