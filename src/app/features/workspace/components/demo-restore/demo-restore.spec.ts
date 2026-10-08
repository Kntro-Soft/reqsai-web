import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { WorkspaceStore } from '../../data/workspace.store';
import { ProjectResponse } from '../../data/workspace.models';
import { DemoRestore } from './demo-restore';

const PROJECT: ProjectResponse = {
  id: 'p1',
  organizationId: 'o1',
  name: 'Demo · Restaurante La Tradición — Reservas en línea',
  description: null,
  programmingLanguages: [],
  frameworks: [],
  clientPlatforms: [],
  databases: [],
  architecture: '',
  domain: '',
  status: 'ACTIVE',
  avatarUrl: null,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  demo: true,
};

const RESTORE_URL = '/api/organizations/o1/projects/p1/demo/restore';

describe('DemoRestore', () => {
  let fixture: ComponentFixture<DemoRestore>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const workspace = { replaceProject: vi.fn() };

  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    workspace.replaceProject.mockReset();
    TestBed.configureTestingModule({
      imports: [
        DemoRestore,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { organizationId: signal('o1') } },
        { provide: ToastService, useValue: toast },
        { provide: WorkspaceStore, useValue: workspace },
      ],
    });
    fixture = TestBed.createComponent(DemoRestore);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const component = () => fixture.componentInstance as unknown as Record<string, unknown>;
  const restore = () => (component()['restore'] as () => void).call(fixture.componentInstance);
  const open = () => component()['open'] as { (): boolean; set(v: boolean): void };

  it('renders the restore trigger and opens the confirmation on click', () => {
    const button = fixture.nativeElement.querySelector('[data-testid="demo-restore"]');
    expect(button).toBeTruthy();
    button.click();
    expect(open()()).toBe(true);
  });

  it('restores the demo, refreshes the store, toasts and emits the fresh project', () => {
    const emitted: ProjectResponse[] = [];
    fixture.componentInstance.restored.subscribe((p) => emitted.push(p));
    open().set(true);

    restore();
    const req = http.expectOne(RESTORE_URL);
    expect(req.request.method).toBe('POST');
    req.flush(PROJECT);

    expect(workspace.replaceProject).toHaveBeenCalledWith(PROJECT);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(emitted).toEqual([PROJECT]);
    expect(open()()).toBe(false);
  });

  it('ignores a second confirm while the restore is in flight', () => {
    restore();
    restore();
    http.expectOne(RESTORE_URL).flush(PROJECT);
  });

  it('keeps the modal open and toasts the error when the backend refuses', () => {
    const emitted: ProjectResponse[] = [];
    fixture.componentInstance.restored.subscribe((p) => emitted.push(p));
    open().set(true);

    restore();
    http
      .expectOne(RESTORE_URL)
      .flush({ code: 'PROJECT_NOT_DEMO', status: 409 }, { status: 409, statusText: 'Conflict' });

    expect(toast.error).toHaveBeenCalledOnce();
    expect(workspace.replaceProject).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(open()()).toBe(true);
  });
});
