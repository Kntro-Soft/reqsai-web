import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { WorkspaceStore } from '../../data/workspace.store';
import { OrgSettings } from './settings';

const ES = {
  orgSettings: {
    audioRetention: 'Retención de audio (días)',
    audioRetentionHint: 'Usa -1 para conservar sin límite.',
    audioRetentionAutoDelete:
      'Los audios que superan este período se eliminan automáticamente cada día.',
  },
};

describe('OrgSettings audio retention (US15/US69)', () => {
  let fixture: ComponentFixture<OrgSettings>;
  let el: HTMLElement;

  beforeEach(async () => {
    const api = {
      getOrganization: vi.fn(() =>
        of({
          id: 'org-1',
          name: 'Acme',
          ownerId: 'u1',
          avatarUrl: null,
          meetingLanguage: 'es-PE',
          audioRetentionDays: 30,
        }),
      ),
      listMembers: vi.fn(() => of([])),
      updateOrganization: vi.fn(() => of({})),
    };
    await TestBed.configureTestingModule({
      imports: [
        OrgSettings,
        TranslocoTestingModule.forRoot({
          langs: { es: ES },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: WorkspaceApiService, useValue: api },
        {
          provide: AuthStore,
          useValue: { organizationId: signal('org-1'), user: signal({ id: 'u1' }) },
        },
        { provide: WorkspaceStore, useValue: { loadOrganizations: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OrgSettings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('shows the configured retention period', () => {
    const input = el.querySelector('#audioRetentionDays') as HTMLInputElement;

    expect(input).not.toBeNull();
    expect(input.value).toBe('30');
  });

  it('explains that audios past the retention period are deleted automatically', () => {
    const explanation = el.querySelector('[data-testid="audio-retention-auto-delete"]');

    expect(explanation?.textContent).toContain('se eliminan automáticamente');
  });
});
