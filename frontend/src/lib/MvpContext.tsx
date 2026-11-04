import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { AnalysisResult } from "./api";
import {
  clearActiveSongRef,
  isValidAnalysisResult,
  persistActiveSongRef,
  resolveCanonicalSongId,
  resolveLibrarySong,
  restoreActiveSongFromSession,
} from "./library";

interface MvpState {
  libraryId: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  /** Playable object URL for the uploaded or generated sample audio/video (in-memory only, never persisted). */
  audioUrl: string | null;
  isSampleAudio: boolean;
  analysis: AnalysisResult | null;
}

interface MvpContextValue extends MvpState {
  /** Canonical identifier for the active song (Library ID preferred, falling back to `file:<fileName>`). */
  canonicalSongId: string | null;
  setSong: (input: {
    libraryId?: string | null;
    fileName: string;
    fileSizeBytes: number;
    audioUrl: string | null;
    isSampleAudio: boolean;
  }) => void;
  setAnalysis: (analysis: AnalysisResult) => void;
  attachAudioFile: (file: File) => void;
  reset: () => void;
}

const emptyState: MvpState = {
  libraryId: null,
  fileName: null,
  fileSizeBytes: null,
  audioUrl: null,
  isSampleAudio: false,
  analysis: null,
};

function getInitialMvpState(): MvpState {
  const restored = restoreActiveSongFromSession();
  if (!restored) return emptyState;
  return {
    libraryId: restored.id,
    fileName: restored.fileName,
    fileSizeBytes: restored.analysis.fileSizeBytes ?? 0,
    audioUrl: null, // Never restore a Blob URL after refresh
    isSampleAudio: false,
    analysis: restored.analysis,
  };
}

const MvpContext = createContext<MvpContextValue | null>(null);

export function MvpProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MvpState>(getInitialMvpState);

  // The session's playable blob: URL. Revoked only when a replacement track
  // arrives or the session is reset, never while it may still be playing.
  const sessionBlobUrlRef = useRef<string | null>(null);
  const adoptBlobUrl = useCallback((url: string | null) => {
    const previous = sessionBlobUrlRef.current;
    if (previous && previous !== url) URL.revokeObjectURL(previous);
    sessionBlobUrlRef.current = url && url.startsWith("blob:") ? url : null;
  }, []);

  const setSong = useCallback<MvpContextValue["setSong"]>((input) => {
    if (input.audioUrl) adoptBlobUrl(input.audioUrl);
    // Manual save only: when libraryId is explicitly null (fresh analysis run),
    // do not auto-bind to any previously saved song with the same filename.
    const isExplicitUnsaved = input.libraryId === null;
    const resolved = isExplicitUnsaved ? null : resolveLibrarySong(input.libraryId || input.fileName);
    const libId = isExplicitUnsaved ? null : (input.libraryId ?? resolved?.id ?? null);
    persistActiveSongRef({ libraryId: libId, fileName: input.fileName });
    setState((prev) => ({
      ...prev,
      libraryId: libId,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      // Keep live session audioUrl if reopening the same file from Library without a new audioUrl
      audioUrl: input.audioUrl ?? (prev.fileName === input.fileName ? prev.audioUrl : null),
      isSampleAudio: input.isSampleAudio,
      analysis: null,
    }));
  }, [adoptBlobUrl]);

  const setAnalysis = useCallback((analysis: AnalysisResult) => {
    if (!isValidAnalysisResult(analysis)) return;
    setState((prev) => {
      const name = prev.fileName ?? analysis.fileName;
      // Preserve explicit unsaved state (prev.libraryId === null when setSong was called for a new analysis)
      const resolved = prev.fileName !== null ? null : (name ? resolveLibrarySong(name) : null);
      const libId = prev.libraryId ?? resolved?.id ?? null;
      if (name) {
        persistActiveSongRef({ libraryId: libId, fileName: name });
      }
      return {
        ...prev,
        libraryId: libId,
        fileName: name ?? prev.fileName,
        analysis,
      };
    });
  }, []);

  const attachAudioFile = useCallback((file: File) => {
    if (!file || file.size <= 0) return;
    const url = URL.createObjectURL(file);
    adoptBlobUrl(url);
    setState((prev) => ({
      ...prev,
      fileSizeBytes: file.size,
      audioUrl: url,
      isSampleAudio: false,
    }));
  }, [adoptBlobUrl]);

  const reset = useCallback(() => {
    adoptBlobUrl(null);
    clearActiveSongRef();
    setState(emptyState);
  }, [adoptBlobUrl]);

  const canonicalSongId = useMemo(() => {
    const ref = state.libraryId || state.fileName || state.analysis?.fileName || "";
    if (!ref) return null;
    const resolvedId = resolveCanonicalSongId(ref);
    return resolvedId || null;
  }, [state.libraryId, state.fileName, state.analysis?.fileName]);

  const value = useMemo(
    () => ({ ...state, canonicalSongId, setSong, setAnalysis, attachAudioFile, reset }),
    [state, canonicalSongId, setSong, setAnalysis, attachAudioFile, reset],
  );

  return <MvpContext.Provider value={value}>{children}</MvpContext.Provider>;
}

export function useMvp() {
  const ctx = useContext(MvpContext);
  if (!ctx) throw new Error("useMvp must be used within <MvpProvider>");
  return ctx;
}
