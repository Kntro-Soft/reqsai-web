import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoryQualityResponse } from '../../data/story-quality.models';
import { StoryQualityBadge } from './story-quality-badge';

const EN = {
  storyQuality: {
    badge: { GOOD: 'Good', FAIR: 'Fair', POOR: 'Poor' },
    notEvaluated: 'Not evaluated',
    hoverTitle: 'Story quality',
    hoverOpen: 'Open the story to see how to improve it.',
    badgeAria: 'Quality {{score}} out of 100, {{level}}',
    characteristic: {
      AMBIGUITY: 'No ambiguity',
      ATOMICITY: 'Atomicity',
      VERIFIABILITY: 'Verifiability',
      COMPLETENESS: 'Completeness',
    },
  },
};

function quality(score: number): StoryQualityResponse {
  return {
    storyId: 's1',
    score,
    evaluatedAt: '2026-11-18T12:00:00Z',
    characteristics: [
      {
        characteristic: 'AMBIGUITY',
        score: 25,
        met: false,
        observation: 'Se detectaron términos ambiguos: «rápido».',
        suggestion: 'Reemplaza cada término.',
      },
      {
        characteristic: 'ATOMICITY',
        score: 100,
        met: true,
        observation: 'Una única acción.',
        suggestion: null,
      },
      {
        characteristic: 'VERIFIABILITY',
        score: 50,
        met: false,
        observation: '1 de 2 criterios no son verificables.',
        suggestion: 'Reescribe el Entonces.',
      },
      {
        characteristic: 'COMPLETENESS',
        score: 100,
        met: true,
        observation: 'Completa.',
        suggestion: null,
      },
    ],
  };
}

describe('StoryQualityBadge', () => {
  let fixture: ComponentFixture<StoryQualityBadge>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        StoryQualityBadge,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
  });

  function render(q: StoryQualityResponse | null | undefined, showLevel = false): HTMLElement {
    fixture = TestBed.createComponent(StoryQualityBadge);
    fixture.componentRef.setInput('quality', q);
    fixture.componentRef.setInput('showLevel', showLevel);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const chip = (el: HTMLElement) =>
    el.querySelector<HTMLElement>('[data-testid="story-quality-badge"]')!;

  it('shows the score as a percentage', () => {
    expect(chip(render(quality(69))).textContent).toContain('69%');
  });

  it('colours the badge by level: good from 80, fair from 50, poor below', () => {
    expect(chip(render(quality(80))).dataset['level']).toBe('GOOD');
    expect(chip(render(quality(69))).dataset['level']).toBe('FAIR');
    expect(chip(render(quality(50))).dataset['level']).toBe('FAIR');
    expect(chip(render(quality(41))).dataset['level']).toBe('POOR');
  });

  it('writes the level next to the percentage only when asked to', () => {
    expect(chip(render(quality(41))).textContent).not.toContain('Poor');
    expect(chip(render(quality(41), true)).textContent).toContain('Poor');
  });

  it('describes the badge to assistive technology', () => {
    expect(chip(render(quality(69))).getAttribute('aria-label')).toBe('Quality 69 out of 100, Fair');
  });

  it('shows a dash when the story has no quality', () => {
    const el = render(null);
    expect(el.querySelector('[data-testid="story-quality-none"]')?.textContent).toContain('—');
    expect(el.querySelector('[data-testid="story-quality-badge"]')).toBeNull();
  });

  it('opens a popover with every characteristic on hover and closes it on leave', () => {
    const el = render(quality(69));
    expect(el.querySelector('[data-testid="story-quality-popover"]')).toBeNull();

    chip(el).dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const popover = el.querySelector('[data-testid="story-quality-popover"]')!;
    expect(popover).not.toBeNull();
    expect(popover.querySelectorAll('[data-testid="story-quality-popover-row"]')).toHaveLength(4);
    expect(popover.textContent).toContain('No ambiguity');
    expect(popover.textContent).toContain('25/100');
    expect(popover.textContent).toContain('69/100');

    chip(el).dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="story-quality-popover"]')).toBeNull();
  });

  it('explains only the characteristics that are not met', () => {
    const el = render(quality(69));
    chip(el).dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const text = el.querySelector('[data-testid="story-quality-popover"]')!.textContent!;
    expect(text).toContain('términos ambiguos');
    expect(text).toContain('no son verificables');
    expect(text).not.toContain('Una única acción');
  });

  it('opens on keyboard focus and closes with Escape', () => {
    const el = render(quality(69));
    chip(el).dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="story-quality-popover"]')).not.toBeNull();

    chip(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="story-quality-popover"]')).toBeNull();
  });
});
