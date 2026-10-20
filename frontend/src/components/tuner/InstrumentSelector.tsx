import type { ReactNode } from "react";
import { tunerInstruments } from "../../lib/instruments/definitions";
import { InstrumentPicker } from "../instruments/InstrumentPicker";

/** First level: the instrument (Guitars, Bass, Folk / string, Keys, Mallet…, Chromatic). Looks like the existing title dropdown. */
export function InstrumentSelector({ value, description, onChange }: { value: string; description: ReactNode; onChange: (id: string) => void }) {
  return <InstrumentPicker label="Instrument" variant="title" value={value} definitions={tunerInstruments()} onChange={onChange} description={description} />;
}
