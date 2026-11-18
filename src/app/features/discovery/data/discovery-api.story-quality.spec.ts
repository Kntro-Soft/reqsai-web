import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';
import { StoryQualityResponse } from './story-quality.models';

const QUALITY: StoryQualityResponse = {
  storyId: 'story-9',
  score: 81,
  evaluatedAt: '2026-11-18T12:00:00Z',
  characteristics: [
    {
      characteristic: 'AMBIGUITY',
      score: 75,
      met: false,
      observation: 'Se detectaron términos ambiguos: «rápido».',
      suggestion: 'Reemplaza cada término por un valor medible.',
    },
  ],
};

/** Story quality endpoints: GET reads the latest assessment, POST evaluates and stores it. */
describe('DiscoveryApiService story quality', () => {
  let api: DiscoveryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiscoveryApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DiscoveryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs the latest assessment of the story', () => {
    let result: StoryQualityResponse | undefined;
    api.getStoryQuality('proj-1', 'story-9').subscribe((q) => (result = q));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9/quality');
    expect(req.request.method).toBe('GET');
    req.flush(QUALITY);
    expect(result).toEqual(QUALITY);
  });

  it('POSTs to evaluate the story now and returns the stored assessment', () => {
    let result: StoryQualityResponse | undefined;
    api.evaluateStoryQuality('proj-1', 'story-9').subscribe((q) => (result = q));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9/quality');
    expect(req.request.method).toBe('POST');
    req.flush(QUALITY);
    expect(result?.score).toBe(81);
  });
});
