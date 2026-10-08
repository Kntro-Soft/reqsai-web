import { describe, expect, it } from 'vitest';
import { reviewTargets } from './story-review.helpers';

describe('reviewTargets', () => {
  it('offers approve and reject for a draft', () => {
    expect(reviewTargets('DRAFT')).toEqual(['APPROVED', 'REJECTED']);
  });

  it('lets an approved story be rejected or sent back to draft', () => {
    expect(reviewTargets('APPROVED')).toEqual(['REJECTED', 'DRAFT']);
  });

  it('lets a rejected story be approved or sent back to draft', () => {
    expect(reviewTargets('REJECTED')).toEqual(['APPROVED', 'DRAFT']);
  });

  it('offers nothing once the story was merged or exported', () => {
    expect(reviewTargets('MERGED')).toEqual([]);
    expect(reviewTargets('EXPORTED')).toEqual([]);
  });

  it('reads a missing or unknown status as a draft', () => {
    expect(reviewTargets(null)).toEqual(['APPROVED', 'REJECTED']);
    expect(reviewTargets(undefined)).toEqual(['APPROVED', 'REJECTED']);
    expect(reviewTargets('archived')).toEqual(['APPROVED', 'REJECTED']);
  });

  it('accepts a lower-case status', () => {
    expect(reviewTargets('approved')).toEqual(['REJECTED', 'DRAFT']);
  });
});
