import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DemoBadge } from './demo-badge';

describe('DemoBadge', () => {
  it('renders the translated "Demo" pill with its explanatory title', () => {
    TestBed.configureTestingModule({
      imports: [
        DemoBadge,
        TranslocoTestingModule.forRoot({
          langs: {
            es: { demo: { badge: 'Demo', badgeTitle: 'Proyecto de demostración' } },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
          preloadLangs: true,
        }),
      ],
    });
    const fixture = TestBed.createComponent(DemoBadge);
    fixture.detectChanges();

    const badge: HTMLElement = fixture.nativeElement.querySelector('[data-testid="demo-badge"]');
    expect(badge.textContent?.trim()).toBe('Demo');
    expect(badge.getAttribute('title')).toBe('Proyecto de demostración');
  });
});
