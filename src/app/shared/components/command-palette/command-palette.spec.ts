import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { CommandRegistry } from '../../search/command-registry';
import { SearchHitResponse } from '../../search/search-api.service';
import { CommandPalette } from './command-palette';

const HITS: SearchHitResponse[] = [
  { type: 'PROJECT', id: 'p1', title: 'Alpha', subtitle: null, projectId: 'p1' },
  { type: 'MEMBER', id: 'm1', title: 'Alice', subtitle: null, projectId: null },
];

describe('CommandPalette', () => {
  let registry: CommandRegistry;
  let palette: CommandPalette;

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [
        CommandPalette,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The palette only reads these; stubs keep the test free of their side effects.
        { provide: AuthService, useValue: { switchOrganization: () => of(null) } },
        { provide: ThemeService, useValue: { toggle: () => undefined } },
        {
          provide: WorkspaceStore,
          useValue: {
            organizations: signal([]),
            projects: signal([]),
            loadProjects: () => undefined,
          },
        },
      ],
    });
    palette = TestBed.createComponent(CommandPalette).componentInstance;
    registry = TestBed.inject(CommandRegistry);
  }

  const ids = () => registry.items().map((item) => item.id);

  /** Types `q`, lets the debounced backend search fire, and answers it with `hits`. */
  async function searchBackend(q: string, hits: SearchHitResponse[]): Promise<void> {
    palette['onQuery'](q);
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 250));
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url === '/api/search')
      .flush(hits);
  }

  it('offers the quick actions, Members included', () => {
    setup();
    expect(ids()).toContain('action:new-project');
    expect(ids()).toContain('action:settings');
    expect(ids()).toContain('action:members');
  });

  it('keeps every backend hit, member hits included', async () => {
    setup();
    await searchBackend('al', HITS);
    expect(ids()).toContain('project:p1');
    expect(ids()).toContain('member:m1');
  });
});
