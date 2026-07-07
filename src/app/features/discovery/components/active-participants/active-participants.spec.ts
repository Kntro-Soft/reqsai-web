import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ActiveParticipants } from './active-participants';
import { SessionParticipant } from '../../data/discovery.models';

function participant(n: number): SessionParticipant {
  return {
    userId: `u${n}`,
    displayName: `User ${n}`,
    avatarUrl: `/api/users/u${n}/avatar`,
  };
}

function people(count: number): SessionParticipant[] {
  return Array.from({ length: count }, (_, i) => participant(i + 1));
}

describe('ActiveParticipants', () => {
  function render(participants: SessionParticipant[], max?: number): HTMLElement {
    TestBed.configureTestingModule({
      imports: [ActiveParticipants, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    });
    const fixture: ComponentFixture<ActiveParticipants> =
      TestBed.createComponent(ActiveParticipants);
    fixture.componentRef.setInput('participants', participants);
    if (max !== undefined) fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders nothing when there are no participants', () => {
    const el = render([]);
    expect(el.querySelector('[data-testid="active-participants"]')).toBeNull();
  });

  it('renders one avatar per participant when under the max', () => {
    const el = render(people(3));
    expect(el.querySelector('[data-testid="active-participants"]')).not.toBeNull();
    expect(el.querySelectorAll('app-avatar')).toHaveLength(3);
    // No overflow bubble.
    expect(el.textContent).not.toContain('+');
  });

  it('caps avatars at the max and shows a "+N" overflow bubble', () => {
    const el = render(people(6), 4);
    expect(el.querySelectorAll('app-avatar')).toHaveLength(4);
    expect(el.textContent).toContain('+2');
  });

  it('exposes an accessible label describing the viewer count', () => {
    const el = render(people(2));
    const root = el.querySelector('[data-testid="active-participants"]');
    expect(root?.getAttribute('aria-label')).toBeTruthy();
  });
});
