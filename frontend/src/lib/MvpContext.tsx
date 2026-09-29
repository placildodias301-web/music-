import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { AnalysisResult } from "./api";

interface MvpState {
  fileName: string | null;
  fileSizeBytes: number | null;
  /** Playable object URL for the uploaded or generated sample audio/video. */
  audioUrl: string | null;
  isSampleAudio: boolean;
  analysis: AnalysisResult | null;
}

interface MvpContextValue extends MvpState {
  setSong: (input: {
    fileName: string;
    fileSizeBytes: number;
    audioUrl: string | null;
    isSampleAudio: boolean;
  }) => void;
  setAnalysis: (analysis: AnalysisResult) => void;
  reset: () => void;
}

const initialState: MvpState = {
  fileName: null,
  fileSizeBytes: null,
  audioUrl: null,
  isSampleAudio: false,
  analysis: null,
};

const MvpContext = createContext<MvpContextValue | null>(null);

export function MvpProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MvpState>(initialState);

  const setSong = useCallback<MvpContextValue["setSong"]>((input) => {
    setState((prev) => ({
      ...prev,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      audioUrl: input.audioUrl,
      isSampleAudio: input.isSampleAudio,
      analysis: null,
    }));
  }, []);

  const setAnalysis = useCallback((analysis: AnalysisResult) => {
    setState((prev) => ({ ...prev, analysis }));
  }, []);

  const reset = useCallback(() => setState(initialState), []);

  const value = useMemo(
    () => ({ ...state, setSong, setAnalysis, reset }),
    [state, setSong, setAnalysis, reset]
  );

  return <MvpContext.Provider value={value}>{children}</MvpContext.Provider>;
}

export function useMvp() {
  const ctx = useContext(MvpContext);
  if (!ctx) throw new Error("useMvp must be used within <MvpProvider>");
  return ctx;
}
