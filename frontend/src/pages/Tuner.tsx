import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SwitchTrack } from "../components/settings/SettingsRows";
import { CalibrationControl } from "../components/tuner/CalibrationControl";
import { CustomTuningModal } from "../components/tuner/CustomTuningModal";
import { Headstock } from "../components/tuner/Headstock";
import { HarpSettings } from "../components/tuner/HarpSettings";
import { HarpStrings } from "../components/tuner/HarpStrings";
import { InstrumentSelector } from "../components/tuner/InstrumentSelector";
import { MicLevel, TunerMeter } from "../components/tuner/TunerMeter";
import { TunerDebugPanel, TunerDisplay } from "../components/tuner/TunerDisplay";
import { TuningSelector } from "../components/tuner/TuningSelector";
import { detectionWindow, findDefinition } from "../lib/instruments/definitions";
import { resolveDefinition, selectionForDefinition } from "../lib/instruments/tunerLink";
import { useSettings } from "../lib/settings/settingsContext";
import { guidance, IN_TUNE_CENTS, outOfRangeSide } from "../lib/tuner/cents";
import { localStorageStore } from "../lib/tuner/customTunings";
import { CUSTOM_POSITIONS_ID, HARP_STATES, LEVER_HARP_RANGE, PEDAL_HARP_RANGE, harpStateById, loadHarp, matchingState, resolveHarpPreset, saveHarp, validateHarpRange, type HarpAccidentals, type HarpRange, type SavedHarp } from "../lib/tuner/harp";
import { loadSelection, saveSelection } from "../lib/tuner/selection";
import { CHROMATIC_ID, defaultTuningId, detectionRange, findInstrument, findTuning, findVariant, targetsFor, tuningsFor, tuningUnits, type TunerSelection } from "../lib/tuner/tunings";
import type { CustomTuning } from "../lib/tuner/types";
import { useTuner } from "../lib/tuner/useTuner";
import { parseTuning } from "../lib/tuning";
import { useNotation } from "../lib/useNotation";

const CHROMATIC_RANGE = { fmin: 30, fmax: 2100 };

export function Tuner() {
  const { settings, update } = useSettings();
  const audio = settings.audio;
  const a4 = audio.a4;
  // Note names follow Settings → Music display (♯/♭, solfège…), like chords elsewhere.
  const notation = useNotation("C Major");
  const letters = (note: string) => notation.chord(note.replace(/-?\d+$/, ""));
  const octaveOf = (note: string) => note.match(/-?\d+$/)?.[0] ?? "";
  const spoken = (note: string | null) => (note ? `${letters(note)}${octaveOf(note)}` : "");

  const [selection, setSelection] = useState<TunerSelection>(() => loadSelection(audio.tuning === "custom" ? "custom-settings-acoustic-6" : audio.tuning));
  const [customs, setCustoms] = useState<CustomTuning[]>(() => localStorageStore.load());
  const [modalOpen, setModalOpen] = useState(false);
  const [isAuto, setIsAuto] = useState(true);
  const [selectedString, setSelectedString] = useState(0);
  const [debug, setDebug] = useState(false);

  const [harpSaved, setHarpSaved] = useState<SavedHarp>(() => loadHarp());
  const [harpRangeError, setHarpRangeError] = useState<string | undefined>();

  const isChromatic = selection.instrumentId === CHROMATIC_ID;
  const instrument = isChromatic ? undefined : findInstrument(selection.instrumentId);
  const variant = instrument ? findVariant(instrument.id, selection.variantId) : undefined;
  const definition = resolveDefinition(selection);
  const isHarp = instrument?.id === "harp";
  const harpRange: HarpRange = variant?.id === "pedal-47" ? PEDAL_HARP_RANGE : variant?.id === "lever-34" ? LEVER_HARP_RANGE : { lowest: harpSaved.lowest, count: harpSaved.count };

  // The default guitar tuning chosen in Settings (incl. its custom notes) shows up as a preset too.
  const allCustoms = useMemo(() => {
    const fromSettings = audio.tuning === "custom" ? parseTuning(audio.customTuning) : null;
    if (!fromSettings) return customs;
    return [
      ...customs,
      ...["acoustic-6", "electric-6"].map((variantId) => ({ id: `settings-${variantId}`, name: "Custom (from Settings)", instrumentId: "guitar", variantId, notes: fromSettings })),
    ];
  }, [customs, audio.tuning, audio.customTuning]);

  const presets = useMemo(() => (variant ? tuningsFor(variant, isHarp ? [] : allCustoms) : []), [variant, allCustoms, isHarp]);
  const preset = useMemo(
    () => (!variant ? undefined : isHarp ? resolveHarpPreset(harpRange, selection.tuningId, harpSaved.accidentals) : findTuning(variant, selection.tuningId, allCustoms)),
    [variant, isHarp, harpRange.lowest, harpRange.count, harpRange.fixedNatural, selection.tuningId, harpSaved.accidentals, allCustoms], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const targets = useMemo(() => (preset ? targetsFor(preset, a4) : []), [preset, a4]);
  const units = useMemo(() => (preset ? tuningUnits(preset) : []), [preset]);
  const range = useMemo(() => (preset ? detectionRange(preset, a4) : isChromatic ? detectionWindow(definition, a4) : CHROMATIC_RANGE), [preset, a4, isChromatic, definition]);
  const mode = isChromatic ? "chromatic" : isAuto ? "auto" : "manual";

  const profile = isHarp ? "harp" : definition.profile ?? "default";
  const tuner = useTuner({ mode, targets, selectedIndex: Math.min(selectedString, Math.max(0, targets.length - 1)), a4, fmin: range.fmin, fmax: range.fmax, profile });
  const { snapshot: snap, listening: isListening, resetTuned } = tuner;

  // Remember the choice; a new instrument/tuning/A4 starts the tuned ticks over.
  useEffect(() => {
    saveSelection(selection);
  }, [selection]);
  useEffect(() => {
    saveHarp(harpSaved);
  }, [harpSaved]);
  useEffect(() => {
    resetTuned();
  }, [selection, a4, resetTuned]);

  const tunedSet = useMemo(() => new Set(snap.tunedIndexes), [snap.tunedIndexes]);
  const tunedCount = targets.filter((_, i) => tunedSet.has(i)).length;
  const allTuned = targets.length > 0 && tunedCount === targets.length;
  const unitTuned = (u: number) => units[u]?.stringIndexes.every((i) => tunedSet.has(i)) ?? false;
  const unitOfString = (si: number) => units.findIndex((u) => u.stringIndexes.includes(si));
  const activeStringIndex = isChromatic ? null : snap.targetIndex ?? (isAuto ? null : selectedString);
  const activeUnit = activeStringIndex !== null ? unitOfString(activeStringIndex) : -1;

  const hasReading = snap.pitchReliable && snap.frequency !== null && snap.cents !== null;
  const cents = snap.cents ?? 0;
  const side = outOfRangeSide(hasReading ? cents : null);
  const inTune = hasReading && Math.abs(cents) <= IN_TUNE_CENTS;
  const isFlat = hasReading && cents < -IN_TUNE_CENTS;
  const isSharp = hasReading && cents > IN_TUNE_CENTS;
  const locked = snap.locked && !snap.held;
  const tone = !hasReading ? "idle" : side !== 0 ? "far" : locked || inTune ? "good" : Math.abs(cents) <= 15 ? "close" : "far";
  const toneColor = { idle: "var(--color-ns-muted)", good: "var(--color-ns-mint)", close: "var(--color-ns-amber)", far: "var(--color-ns-red)" }[tone];

  /** `id` is an entry of the shared instrument list (Guitar, Acoustic Guitar, Piano, Harp, Chromatic…). */
  function selectInstrument(id: string) {
    const def = findDefinition(id) ?? findDefinition("chromatic")!;
    setSelection(selectionForDefinition(def));
    setSelectedString(0);
  }
  function selectVariant(id: string) {
    const v = findVariant(selection.instrumentId, id)!;
    const keep = tuningsFor(v, isHarp ? [] : allCustoms).some((t) => t.id === selection.tuningId) || (isHarp && selection.tuningId === CUSTOM_POSITIONS_ID);
    setSelection({ instrumentId: selection.instrumentId, variantId: v.id, tuningId: keep ? selection.tuningId : defaultTuningId(v), definitionId: selection.definitionId });
    setSelectedString(0);
  }
  function selectTuning(id: string) {
    const state = harpStateById(id);
    if (isHarp && state) setHarpSaved((h) => ({ ...h, accidentals: state.accidentals }));
    setSelection({ ...selection, tuningId: id });
    setSelectedString(0);
  }
  /** Lever/pedal positions changed by hand: a matching named key if there is one, else "Custom positions". */
  function changeHarpPositions(acc: HarpAccidentals) {
    setHarpSaved((h) => ({ ...h, accidentals: acc }));
    setSelection((sel) => ({ ...sel, tuningId: matchingState(acc)?.id ?? CUSTOM_POSITIONS_ID }));
    setSelectedString(0);
  }
  function changeHarpRange(lowest: string, count: number) {
    const check = validateHarpRange(lowest, count);
    setHarpRangeError(check.ok ? undefined : check.error);
    if (check.ok) setHarpSaved((h) => ({ ...h, lowest: lowest.trim(), count }));
    setSelectedString(0);
  }

  function saveCustom(c: CustomTuning) {
    const next = [...customs, c];
    setCustoms(next);
    localStorageStore.save(next);
    setSelection({ instrumentId: c.instrumentId, variantId: c.variantId, tuningId: `custom-${c.id}` });
    setSelectedString(0);
    setModalOpen(false);
  }
  function deleteCustom(id: string) {
    const next = customs.filter((c) => c.id !== id);
    setCustoms(next);
    localStorageStore.save(next);
    if (selection.tuningId === `custom-${id}` && variant) setSelection({ ...selection, tuningId: variant.tunings[0].id });
  }

  /** Tap a peg: pick its string (cycling through a course's strings) and play the reference note. */
  function selectUnit(unitIndex: number) {
    const unit = units[unitIndex];
    if (!unit) return;
    const pos = unit.stringIndexes.indexOf(selectedString);
    const next = !isAuto && pos >= 0 ? unit.stringIndexes[(pos + 1) % unit.stringIndexes.length] : unit.stringIndexes[0];
    setIsAuto(false);
    setSelectedString(next);
    tuner.playTone(targets[next].frequency);
  }

  /** Harp: tap a string (no pegs) — pick it, play its reference note. */
  function selectString(index: number) {
    if (!targets[index]) return;
    setIsAuto(false);
    setSelectedString(index);
    tuner.playTone(targets[index].frequency);
  }

  const tuningName = isChromatic ? (definition.id === "chromatic" ? "Any note" : "Note check") : preset?.name ?? "";
  // A harp or a 12-string has too many strings to list: name the pegs (or the range) instead.
  const stringsText =
    units.length <= 8 ? units.map((u) => letters(targets[u.stringIndexes[0]].note)).join(" ") : `${letters(targets[0].note)}${octaveOf(targets[0].note)}–${letters(targets[targets.length - 1].note)}${octaveOf(targets[targets.length - 1].note)} · ${targets.length} strings`;
  const subtitle = `${tuningName}${isChromatic || !stringsText ? "" : ` · ${stringsText}`} · A4 = ${a4} Hz`;
  const tooQuiet = isListening && !hasReading && snap.tooQuiet;
  const selectedTarget = targets[Math.min(selectedString, targets.length - 1)];

  const status = tuner.error
    ? null
    : !isListening
    ? isChromatic
      ? "Press Start, then sing or play a note."
      : "Press Start, then play one string at a time."
    : !hasReading
    ? tooQuiet
      ? "We can't hear anything. Move closer to the mic, or check your input device."
      : isChromatic
      ? "Listening… play any note."
      : isAuto
      ? "Listening… play any string — Wilsify finds which one."
      : `Listening… play the ${spoken(selectedTarget?.note ?? null)} string.`
    : side !== 0
    ? `${side < 0 ? "Too low — tune up" : "Too high — tune down"} toward ${spoken(snap.targetNote)} (you're playing ${spoken(snap.detectedNote)}).`
    : locked
    ? allTuned
      ? "All strings in tune — you're ready to play."
      : `${spoken(snap.targetNote)} is in tune.`
    : inTune
    ? "Hold it there…"
    : isChromatic
    ? `${isFlat ? "A little low" : "A little high"} for ${spoken(snap.targetNote)}.`
    : guidance(cents, spoken(snap.targetNote));

  const stringCountLabel = variant && variant.courseCount !== variant.stringCount ? `strings (${variant.courseCount} courses)` : "strings";
  const harpTunings = useMemo(() => (isHarp ? [...presets, resolveHarpPreset(harpRange, CUSTOM_POSITIONS_ID, harpSaved.accidentals)] : presets), [isHarp, presets, harpRange.lowest, harpRange.count, harpSaved.accidentals]); // eslint-disable-line react-hooks/exhaustive-deps
  const harpBlurb = (id: string) => (id === CUSTOM_POSITIONS_ID ? "Set each letter yourself" : HARP_STATES.find((st) => st.id === id)?.blurb ?? "Major key setting");
  const headUnits = units.map((u) => ({ note: targets[u.stringIndexes[0]].note, freq: targets[u.stringIndexes[0]].frequency }));

  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-10 ${isChromatic ? "max-w-xl" : "max-w-3xl"}`}>
      <div className="mb-5 text-center sm:mb-7">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">Tuner</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--color-ns-muted)]">
          {isChromatic ? "Sing or play any note and Wilsify shows how close you are." : "Play one string at a time. Wilsify lights up the peg to turn, and which way."}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-xl sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-500 motion-reduce:transition-none"
          style={{ background: toneColor, opacity: hasReading ? (locked ? 0.2 : 0.08) : 0 }}
        />

        <div className="relative mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <InstrumentSelector value={selection.instrumentId} description={subtitle} onChange={selectInstrument} />
          </div>
          {!isChromatic && (
            <button
              type="button"
              role="switch"
              aria-checked={isAuto}
              onClick={() => setIsAuto((v) => !v)}
              title={isAuto ? "Auto: Wilsify finds which string you play" : "Manual: tap a peg to pick the string"}
              className="mt-0.5 flex flex-shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Auto</span>
              <SwitchTrack checked={isAuto} tone="mint" />
            </button>
          )}
        </div>

        {instrument && variant && (
          <TuningSelector
            variants={instrument.variants}
            variantId={variant.id}
            onVariant={selectVariant}
            tunings={harpTunings}
            tuningId={preset?.id ?? ""}
            onTuning={selectTuning}
            onNewCustom={() => setModalOpen(true)}
            noteLabel={letters}
            variantLabel={instrument.variantLabel}
            describe={isHarp ? (t) => harpBlurb(t.id) : undefined}
            allowCustom={!isHarp}
          />
        )}

        {isHarp && variant && (
          <HarpSettings
            accidentals={harpSaved.accidentals}
            onAccidentals={changeHarpPositions}
            custom={variant.id === "harp-custom"}
            lowest={harpSaved.lowest}
            count={harpSaved.count}
            onRange={changeHarpRange}
            rangeError={harpRangeError}
            pedal={variant.id === "pedal-47"}
          />
        )}
        {(preset?.note || definition.caveat) && (
          <p className="relative mb-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-ns-muted)]">
            {[preset?.note, definition.caveat].filter(Boolean).join(" ")}
          </p>
        )}

        <div className={`relative grid items-center gap-6 ${variant ? "md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`}>
          {variant && (
            <div className="order-2 md:order-1">
              {isHarp ? (
                <HarpStrings
                  targets={targets}
                  activeIndex={activeStringIndex !== null && (!isAuto || hasReading) ? activeStringIndex : null}
                  tuned={tunedSet}
                  ringing={hasReading && !snap.held}
                  color={toneColor}
                  locked={locked}
                  label={letters}
                  onSelect={selectString}
                />
              ) : (
                <Headstock
                  kind={variant.head}
                  strings={headUnits}
                  label={letters}
                  activeIndex={activeUnit >= 0 && (!isAuto || hasReading) ? activeUnit : null}
                  ringing={hasReading && !snap.held}
                  color={toneColor}
                  turn={isFlat ? "tighten" : isSharp ? "loosen" : null}
                  locked={locked}
                  tuned={unitTuned}
                  onSelect={selectUnit}
                />
              )}
              <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                <span className={allTuned ? "font-bold text-[var(--color-ns-mint)]" : "text-[var(--color-ns-muted)]"}>
                  {allTuned ? `✓ All ${stringCountLabel} tuned` : `${tunedCount} of ${targets.length} ${stringCountLabel} tuned`}
                </span>
                {tunedCount > 0 && (
                  <button type="button" onClick={resetTuned} className="font-semibold text-[var(--color-ns-purple-light)] hover:underline">
                    Reset
                  </button>
                )}
              </div>
              <p className="mt-1 text-center text-[0.6875rem] text-[var(--color-ns-dim)]">{isAuto ? (isHarp ? "Tap a string to hear its note" : "Tap a peg to hear its note") : isHarp ? "Manual: tuning the string you tapped" : "Manual: tuning the peg you tapped"}</p>
            </div>
          )}

          <div className="order-1 md:order-2">
            <TunerMeter cents={cents} active={hasReading} held={snap.held} color={toneColor} isFlat={isFlat} isSharp={isSharp} outOfRange={side} />
            <TunerDisplay snap={snap} toneColor={toneColor} locked={locked} letters={letters} octaveOf={octaveOf} isListening={isListening} showTarget />

            <p
              role="status"
              aria-live="polite"
              className={`relative mx-auto mt-4 flex min-h-[2.75rem] max-w-sm items-center justify-center rounded-xl px-3 text-center text-sm font-semibold ${
                locked ? "bg-[var(--color-ns-mint)]/12 text-[var(--color-ns-mint)]" : "text-[var(--color-ns-text)]"
              }`}
            >
              {locked && (
                <span aria-hidden="true" className="mr-1.5">
                  ✓
                </span>
              )}
              {status}
            </p>

            {isListening && <MicLevel level={snap.rms} quiet={tooQuiet} />}
            {debug && <TunerDebugPanel snap={snap} mode={mode} micInfo={tuner.micInfo} />}

            {tuner.error && (
              <div role="alert" className="relative mt-4 rounded-xl border border-[var(--color-ns-red)]/30 bg-[var(--color-ns-red)]/10 p-3.5 text-center text-sm text-[var(--color-ns-text)]">
                {tuner.error}
              </div>
            )}

            <button
              type="button"
              onClick={isListening ? tuner.stop : tuner.start}
              className={`relative mt-5 w-full py-3 text-sm font-bold transition-all ${
                isListening
                  ? "rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-red)]/50 hover:text-[var(--color-ns-red)]"
                  : "btn-primary shadow-lg"
              }`}
            >
              {isListening ? "Stop tuner" : "Start tuner"}
            </button>
          </div>
        </div>

        <div className="relative mt-5 flex flex-col items-center gap-2">
          <CalibrationControl a4={a4} onChange={(v) => update("audio", { a4: v })} />
          <p className="text-center text-xs text-[var(--color-ns-dim)]">
            The default guitar tuning lives in{" "}
            <Link to="/settings" className="font-semibold text-[var(--color-ns-purple-light)] hover:underline">
              Settings
            </Link>
            .{" "}
            <button type="button" onClick={() => setDebug((d) => !d)} aria-pressed={debug} className="underline-offset-2 hover:underline">
              {debug ? "Hide" : "Show"} developer info
            </button>
          </p>
        </div>
      </div>

      {modalOpen && variant && instrument && preset && (
        <CustomTuningModal instrumentId={instrument.id} variant={variant} basePreset={preset} saved={customs} onSave={saveCustom} onDelete={deleteCustom} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
