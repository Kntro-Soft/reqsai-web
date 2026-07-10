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
  afterEach(() => {
    // CDK overlays are portalled onto document.body and outlive the fixture.
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  function build(participants: SessionParticipant[], max?: number): ComponentFixture<ActiveParticipants> {
    TestBed.configureTestingModule({
      imports: [ActiveParticipants, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    });
    const fixture = TestBed.createComponent(ActiveParticipants);
    fixture.componentRef.setInput('participants', participants);
    if (max !== undefined) fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture;
  }

  function render(participants: SessionParticipant[], max?: number): HTMLElement {
    return build(participants, max).nativeElement as HTMLElement;
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

  it('is closed by default and opens a panel listing every participant on click', async () => {
    const fixture = build(people(6), 4);
    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="active-participants"]',
    ) as HTMLElement;
    expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(0);

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // The panel lists all 6, not just the 4 collapsed into the avatar stack.
    const rows = document.querySelectorAll('[data-testid="active-participants-row"]');
    expect(rows).toHaveLength(6);
    expect(document.body.textContent).toContain('User 1');
    expect(document.body.textContent).toContain('User 6');
  });

  it('toggles closed on a second click', async () => {
    const fixture = build(people(3));
    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="active-participants"]',
    ) as HTMLElement;

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(3);

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(0);
  });

  it('opens on mouse hover, without requiring a click', async () => {
    const fixture = build(people(2));
    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="active-participants"]',
    ) as HTMLElement;

    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(2);
  });

  it('closes shortly after the mouse leaves, so moving into the panel does not flicker-close it', async () => {
    vi.useFakeTimers();
    try {
      const fixture = build(people(2));
      const trigger = fixture.nativeElement.querySelector(
        '[data-testid="active-participants"]',
      ) as HTMLElement;

      trigger.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      trigger.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();

      // Still open immediately after mouseleave (grace period).
      expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(2);

      vi.advanceTimersByTime(250);
      fixture.detectChanges();

      expect(document.querySelectorAll('[data-testid="active-participants-row"]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
