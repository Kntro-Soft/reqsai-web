import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';
import { StorySourcesResponse } from './story-sources.models';

/** Story sources endpoint: GET .../stories/{id}/sources answering where the story comes from. */
describe('DiscoveryApiService story sources', () => {
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

  it('GETs the sources of a story of the project', () => {
    let result: StorySourcesResponse | undefined;
    api.getStorySources('proj-1', 'story-9').subscribe((s) => (result = s));

    const req = http.expectOne('/api/projects/proj-1/stories/story-9/sources');
    expect(req.request.method).toBe('GET');
    req.flush({ storyId: 'story-9', origin: 'MANUAL', fragments: [] });

    expect(result?.origin).toBe('MANUAL');
    expect(result?.fragments).toEqual([]);
  });
});
