import type { ChordModel } from "../../lib/chords/model";
import { AccordionChord } from "./AccordionChord";
import { BassChord } from "./BassChord";
import { FretboardDiagram } from "./FretboardDiagram";
import { HarpChord } from "./HarpChord";
import { KeyboardChord } from "./KeyboardChord";
import { HarmonicaChord, WindChord } from "./WindChord";

/** Draws a chord model. The model's `kind` (set by the instrument's renderer in lib/instruments/definitions.ts) picks the component. */
export function ChordDiagram({ model, shapeIndex, onShape }: { model: ChordModel; shapeIndex: number; onShape: (i: number) => void }) {
  switch (model.kind) {
    case "fretted": {
      const shape = model.shapes[shapeIndex % Math.max(model.shapes.length, 1)];
      if (!shape) return <p className="max-w-[16rem] text-center text-xs text-[var(--color-ns-muted)]">No playable {model.chord.label} shape found on this tuning.</p>;
      return (
        <FretboardDiagram
          stringNames={model.stringNames}
          frets={shape.frets}
          drone={model.tuning.drone}
          courses={model.courses ? model.tuning.offsets : undefined}
          fretless={model.definition.fretless}
          caption={shape.name}
          ariaLabel={`${model.chord.label} on ${model.definition.name}, ${model.tuning.name}`}
        />
      );
    }
    case "bass":
      return <BassChord model={model} shapeIndex={shapeIndex} onShape={onShape} />;
    case "keyboard":
      return <KeyboardChord keys={model.keys} caption={model.definition.name} />;
    case "mallet":
      return <KeyboardChord keys={model.keys} variant="bars" caption={`${model.definition.name} bars`} />;
    case "harp":
      return <HarpChord model={model} />;
    case "accordion":
      return <AccordionChord model={model} />;
    case "wind":
      return <WindChord model={model} />;
    case "harmonica":
      return <HarmonicaChord model={model} />;
  }
}
