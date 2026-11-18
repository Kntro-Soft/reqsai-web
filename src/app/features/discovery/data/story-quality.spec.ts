import { describe, expect, it } from 'vitest';
import {
  FAIR_SCORE,
  GOOD_SCORE,
  clampScore,
  qualityLevel,
  ringOffset,
  unmetFindings,
} from './story-quality';
import { QualityFindingResponse, StoryQualityResponse } from './story-quality.models';

function finding(
  characteristic: QualityFindingResponse['characteristic'],
  score: number,
): QualityFindingResponse {
  return {
    characteristic,
    score,
    met: score === 100,
    observation: 'obs',
    suggestion: score === 100 ? null : 'fix',
  };
}

describe('story quality helpers', () => {
  describe('qualityLevel', () => {
    it('reads 80 and above as good, 50 to 79 as fair and below 50 as poor', () => {
      expect(qualityLevel(100)).toBe('GOOD');
      expect(qualityLevel(GOOD_SCORE)).toBe('GOOD');
      expect(qualityLevel(GOOD_SCORE - 1)).toBe('FAIR');
      expect(qualityLevel(FAIR_SCORE)).toBe('FAIR');
      expect(qualityLevel(FAIR_SCORE - 1)).toBe('POOR');
      expect(qualityLevel(0)).toBe('POOR');
    });

    it('clamps out-of-range scores', () => {
      expect(qualityLevel(140)).toBe('GOOD');
      expect(qualityLevel(-20)).toBe('POOR');
    });
  });

  describe('clampScore', () => {
    it('keeps a score inside 0..100, rounded, and reads a non-number as 0', () => {
      expect(clampScore(62.5)).toBe(63);
      expect(clampScore(-3)).toBe(0);
      expect(clampScore(101)).toBe(100);
      expect(clampScore(Number.NaN)).toBe(0);
    });
  });

  describe('unmetFindings', () => {
    it('lists the characteristics still to fix, in evaluation order', () => {
      const quality: StoryQualityResponse = {
        storyId: 's1',
        score: 63,
        evaluatedAt: '2026-11-18T12:00:00Z',
        characteristics: [
          finding('AMBIGUITY', 75),
          finding('ATOMICITY', 100),
          finding('VERIFIABILITY', 0),
          finding('COMPLETENESS', 100),
        ],
      };
      expect(unmetFindings(quality).map((f) => f.characteristic)).toEqual([
        'AMBIGUITY',
        'VERIFIABILITY',
      ]);
    });

    it('is empty when everything is met or there is no assessment', () => {
      expect(unmetFindings(null)).toEqual([]);
      expect(
        unmetFindings({
          storyId: 's1',
          score: 100,
          evaluatedAt: '2026-11-18T12:00:00Z',
          characteristics: [finding('AMBIGUITY', 100)],
        }),
      ).toEqual([]);
    });
  });

  describe('ringOffset', () => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;

    it('hides the whole ring at 0 and none of it at 100', () => {
      expect(ringOffset(0, radius)).toBeCloseTo(circumference);
      expect(ringOffset(100, radius)).toBeCloseTo(0);
    });

    it('shows the matching share of the circle in between', () => {
      expect(ringOffset(50, radius)).toBeCloseTo(circumference / 2);
      expect(ringOffset(75, radius)).toBeCloseTo(circumference / 4);
    });

    it('clamps scores outside 0..100', () => {
      expect(ringOffset(250, radius)).toBeCloseTo(0);
      expect(ringOffset(-5, radius)).toBeCloseTo(circumference);
    });
  });
});
