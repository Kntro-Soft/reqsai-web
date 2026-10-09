import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PanelStoryEditor } from './panel-story-editor';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { DisplayStory, UserStoryResponse } from '../../data/discovery.models';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';

const STORY: DisplayStory = {
  id: 'st-1',
  title: 'Reservar mesa por Internet',
  role: 'comensal',
  action: 'reservar una mesa desde la web',
  benefit: 'no tener que llamar',
  priority: 'HIGH',
  storyPoints: 3,
  createdAt: '2026-10-08T10:00:00Z',
  acceptanceCriteria: [],
  status: 'DRAFT',
};

function response(patch: Partial<UserStoryResponse> = {}): UserStoryResponse {
  return {
    id: 'st-1',
    projectId: 'p1',
    sessionId: null,
    title: STORY.title,
    role: STORY.role,
    action: STORY.action,
    benefit: STORY.benefit,
    priority: 'HIGH',
    storyPoints: 3,
    status: 'DRAFT',
    embeddingIndexed: true,
    createdAt: '2026-10-08T10:00:00Z',
    updatedAt: '2026-10-08T10:00:00Z',
    acceptanceCriteria: [],
    ...patch,
  } as UserStoryResponse;
}

describe('PanelStoryEditor', () => {
  let api: { changeStoryStatus: ReturnType<typeof vi.fn>; updateStory: ReturnType<typeof vi.fn> };
  let store: { applyStoryUpdate: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let granted: Set<string>;

  function render(story: DisplayStory = STORY): {
    fixture: ComponentFixture<PanelStoryEditor>;
    el: HTMLElement;
  } {
    api = {
      changeStoryStatus: vi.fn(() => of(response({ status: 'APPROVED' }))),
      updateStory: vi.fn(() => of(response({ title: 'Reservar mesa en línea' }))),
    };
    store = { applyStoryUpdate: vi.fn() };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [PanelStoryEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: DiscoveryApiService, useValue: api },
        { provide: DiscoveryChatStore, useValue: store },
        { provide: ToastService, useValue: toast },
        {
          provide: PermissionsStore,
          useValue: {
            has: (p: string) => granted.has(p),
            isOrgOwner: () => false,
            isOrgOwnerOrAdmin: () => false,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PanelStoryEditor);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('story', story);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  beforeEach(() => {
    granted = new Set(['STORY_APPROVE', 'STORY_WRITE']);
  });

  it('offers approve and reject on a draft, and records the decision in the backlog', () => {
    const { fixture, el } = render();

    expect(byTestId(el, 'panel-story-review-approved')).not.toBeNull();
    expect(byTestId(el, 'panel-story-review-rejected')).not.toBeNull();
    expect(byTestId(el, 'panel-story-review-draft')).toBeNull();

    byTestId(el, 'panel-story-review-approved')!.click();
    fixture.detectChanges();

    expect(api.changeStoryStatus).toHaveBeenCalledWith('p1', 'st-1', 'APPROVED');
    expect(store.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('offers going back to draft once a story is approved', () => {
    const { el } = render({ ...STORY, status: 'APPROVED' });

    expect(byTestId(el, 'panel-story-review-approved')).toBeNull();
    expect(byTestId(el, 'panel-story-review-draft')).not.toBeNull();
  });

  it('edits the story inline and saves only what changed', () => {
    const { fixture, el } = render();

    byTestId(el, 'panel-story-edit')!.click();
    fixture.detectChanges();
    const save = byTestId(el, 'panel-story-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    const title = byTestId(el, 'panel-story-title-input') as HTMLInputElement;
    title.value = 'Reservar mesa en línea';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(save.disabled).toBe(false);

    save.click();
    fixture.detectChanges();

    expect(api.updateStory).toHaveBeenCalledWith('p1', 'st-1', {
      title: 'Reservar mesa en línea',
      role: 'comensal',
      action: 'reservar una mesa desde la web',
      benefit: 'no tener que llamar',
      priority: 'HIGH',
      storyPoints: 3,
    });
    expect(store.applyStoryUpdate).toHaveBeenCalled();
    expect(byTestId(el, 'panel-story-form')).toBeNull();
    expect(byTestId(el, 'panel-story-body')).not.toBeNull();
  });

  it('keeps the form open with the reason when saving fails', () => {
    const { fixture, el } = render();
    api.updateStory.mockReturnValue(throwError(() => new Error('boom')));

    byTestId(el, 'panel-story-edit')!.click();
    fixture.detectChanges();
    const role = byTestId(el, 'panel-story-role-input') as HTMLTextAreaElement;
    role.value = 'cliente frecuente';
    role.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (byTestId(el, 'panel-story-save') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(byTestId(el, 'panel-story-form')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(store.applyStoryUpdate).not.toHaveBeenCalled();
  });

  it('cancels the edit with Escape without saving', () => {
    const { fixture, el } = render();

    byTestId(el, 'panel-story-edit')!.click();
    fixture.detectChanges();
    byTestId(el, 'panel-story-form')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(byTestId(el, 'panel-story-form')).toBeNull();
    expect(api.updateStory).not.toHaveBeenCalled();
  });

  it('hides review and edit from a member without those permissions', () => {
    granted = new Set();
    const { el } = render();

    expect(byTestId(el, 'panel-story-review-approved')).toBeNull();
    expect(byTestId(el, 'panel-story-edit')).toBeNull();
    expect(byTestId(el, 'panel-story-open')).not.toBeNull();
  });
});
