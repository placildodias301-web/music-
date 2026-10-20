import { describe, it, expect } from 'vitest';
import { findSegmentIndex, findNextSegmentIndex } from './chordSync';
import type { ChordSegment } from './api';

describe('chordSync', () => {
  const timeline: ChordSegment[] = [
    { chord: 'C', start: 0, end: 2, confidence: 0.9 },
    { chord: 'G', start: 2, end: 4, confidence: 0.8 },
    { chord: 'Am', start: 4, end: 6, confidence: 0.3, alternative: 'C' },
    { chord: 'F', start: 6, end: 8, confidence: 0.95 },
  ];

  describe('findSegmentIndex', () => {
    it('returns -1 for empty timeline', () => {
      expect(findSegmentIndex([], 1)).toBe(-1);
    });

    it('finds correct segment for exact boundaries', () => {
      expect(findSegmentIndex(timeline, 0)).toBe(0);
      expect(findSegmentIndex(timeline, 2)).toBe(1);
      expect(findSegmentIndex(timeline, 4)).toBe(2);
      expect(findSegmentIndex(timeline, 6)).toBe(3);
    });

    it('finds correct segment for middle times', () => {
      expect(findSegmentIndex(timeline, 1)).toBe(0);
      expect(findSegmentIndex(timeline, 3)).toBe(1);
      expect(findSegmentIndex(timeline, 5)).toBe(2);
      expect(findSegmentIndex(timeline, 7)).toBe(3);
    });

    it('returns -1 for time before start', () => {
      expect(findSegmentIndex(timeline, -1)).toBe(-1);
    });

    it('returns -1 for time after end', () => {
      expect(findSegmentIndex(timeline, 9)).toBe(-1);
    });
  });

  describe('findNextSegmentIndex', () => {
    it('returns index of next segment', () => {
      expect(findNextSegmentIndex(timeline, 1)).toBe(1);
      expect(findNextSegmentIndex(timeline, 2)).toBe(2);
      expect(findNextSegmentIndex(timeline, 3)).toBe(2);
    });
  });

  describe('sync offsets logic (manual check)', () => {
    it('applies offset correctly before lookup', () => {
      const syncOffsetMs = 500; // 0.5s
      const audioTime = 1.5;
      const analysisTime = audioTime - (syncOffsetMs / 1000); // 1.0
      
      expect(findSegmentIndex(timeline, analysisTime)).toBe(0);
    });
  });
});

import { findHeldSegmentIndex } from './chordSync';

describe('findHeldSegmentIndex (a chord never disappears)', () => {
  const gapped = [
    { chord: 'D', start: 1, end: 3 },
    { chord: 'A', start: 5, end: 6 },
  ];
  it('is -1 only for an empty timeline', () => {
    expect(findHeldSegmentIndex([], 2)).toBe(-1);
  });
  it('returns the sounding chord inside a segment', () => {
    expect(findHeldSegmentIndex(gapped, 2)).toBe(0);
    expect(findHeldSegmentIndex(gapped, 5.5)).toBe(1);
  });
  it('holds the previous chord across a gap', () => {
    expect(findHeldSegmentIndex(gapped, 4)).toBe(0);
  });
  it('shows the first chord before it starts and the last after it ends', () => {
    expect(findHeldSegmentIndex(gapped, 0)).toBe(0);
    expect(findHeldSegmentIndex(gapped, 99)).toBe(1);
  });
});
