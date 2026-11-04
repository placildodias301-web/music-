/**
 * alphaTab score fixes for generated guitar sheets (backend/services/guitar_tab.py).
 *
 * alphaTab's score model is untyped here, as in Sheet.tsx.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** General MIDI programs 0-7 (alphaTab counts from 0) are pianos: their fingering is 1 = thumb. */
const isPianoProgram = (program: number | undefined) => program !== undefined && program >= 0 && program <= 7;

/**
 * Prepares a just-loaded score:
 *
 * - MusicXML import makes a <staff-tuning> staff (guitar, bass, ukulele) TAB-only
 *   with one notation line per string; generated sheets want standard notation
 *   above the TAB.
 * - The importer files each note under its string before reading <string>, so
 *   it drops every <hammer-on>/<pull-off>. The sheet also slurs each pair (the
 *   notation for H/P), and slurs survive: those on one string become H/P again.
 * - MusicXML string-player fingering is 1 = index ... 4 = pinky, 0 = open;
 *   alphaTab reads the digits as piano fingering (1 = thumb), one finger too low.
 *   Piano tracks keep theirs.
 *
 * Returns whether the score had a TAB staff. Call once per load.
 */
export function prepareGuitarTabScore(score: any): boolean {
  let guitar = false;
  for (const track of score.tracks ?? []) {
    const shiftFingers = !isPianoProgram(track.playbackInfo?.program);
    for (const staff of track.staves ?? []) {
      const tab = (staff.stringTuning?.tunings?.length ?? 0) > 0 && !staff.showStandardNotation;
      if (tab) {
        guitar = true;
        staff.showStandardNotation = true;
        staff.showTablature = true;
        staff.standardNotationLineCount = 5;
      }
      for (const bar of staff.bars ?? []) {
        for (const voice of bar.voices ?? []) {
          for (const beat of voice.beats ?? []) {
            if (shiftFingers) {
              for (const note of beat.notes ?? []) if (note.leftHandFinger >= 0) note.leftHandFinger += 1;
            }
            if (!tab) continue;
            beat.noteStringLookup?.clear();
            for (const note of beat.notes ?? []) {
              if (note.isStringed) beat.noteStringLookup?.set(note.string, note);
              const dest = note.slurDestination;
              if (dest && dest.string === note.string && dest.fret !== note.fret) {
                note.isHammerPullOrigin = true;
                note.hammerPullDestination = dest;
                dest.hammerPullOrigin = note;
                // The H/P arc replaces the slur; keeping both would draw two arcs.
                note.slurDestination = null;
                dest.slurOrigin = null;
                dest.isSlurDestination = false;
              }
            }
          }
        }
      }
    }
  }
  return guitar;
}
