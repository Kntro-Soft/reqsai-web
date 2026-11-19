import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';
import {
  ApplyStoryImprovementResponse,
  StoryImprovementProposal,
  StoryImprovementResponse,
} from './story-improvement.models';

const QUALITY = {
  storyId: 'story-9',
  score: 90,
  evaluatedAt: '2026-11-18T12:00:00Z',
  characteristics: [],
};

const PROPOSAL: StoryImprovementProposal = {
  title: 'T',
  role: 'R',
  action: 'A',
  benefit: 'B',
  acceptanceCriteria: [{ scenario: null, given: 'g', when: 'w', then: 't' }],
};

describe('DiscoveryApiService story improvement', () => {
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

  it('POSTs without a body to ask for a proposal', () => {
    const body: StoryImprovementResponse = {
      storyId: 'story-9',
      proposal: PROPOSAL,
      pendingValues: [{ token: '[[x]]', hint: '¿x?' }],
      fixes: ['Se corrigió algo'],
      expectedQuality: QUALITY,
    };
    let result: StoryImprovementResponse | undefined;
    api.improveStory('proj-1', 'story-9').subscribe((r) => (result = r));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9/quality/improvement');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(body);
    expect(result).toEqual(body);
  });

  it('POSTs the edited proposal to apply it and returns the saved story and quality', () => {
    let result: ApplyStoryImprovementResponse | undefined;
    api.applyStoryImprovement('proj-1', 'story-9', PROPOSAL).subscribe((r) => (result = r));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9/quality/improvement/apply');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(PROPOSAL);
    req.flush({ story: { id: 'story-9' }, quality: QUALITY });
    expect(result?.quality.score).toBe(90);
  });
});
