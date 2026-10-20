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
  const attachedBlobUrlRef = useRef<string | null>(null);

  const setSong = useCallback<MvpContextValue["setSong"]>((input) => {
    const resolved = resolveLibrarySong(input.libraryId || input.fileName);
    const libId = input.libraryId ?? resolved?.id ?? null;
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
  }, []);

  const setAnalysis = useCallback((analysis: AnalysisResult) => {
    if (!isValidAnalysisResult(analysis)) return;
    setState((prev) => {
      const name = prev.fileName ?? analysis.fileName;
      const resolved = name ? resolveLibrarySong(prev.libraryId || name) : null;
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
    if (attachedBlobUrlRef.current) {
      URL.revokeObjectURL(attachedBlobUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    attachedBlobUrlRef.current = url;
    setState((prev) => ({
      ...prev,
      fileSizeBytes: file.size,
      audioUrl: url,
      isSampleAudio: false,
    }));
  }, []);

  const reset = useCallback(() => {
    if (attachedBlobUrlRef.current) {
      URL.revokeObjectURL(attachedBlobUrlRef.current);
      attachedBlobUrlRef.current = null;
    }
    clearActiveSongRef();
    setState(emptyState);
  }, []);

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
