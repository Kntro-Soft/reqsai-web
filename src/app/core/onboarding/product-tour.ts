import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { driver, DriveStep } from 'driver.js';
import { OnboardingStore } from './onboarding.store';

interface TourStop {
  target: string;
  key: string;
  side: 'right' | 'bottom' | 'top';
}

const STOPS: TourStop[] = [
  { target: 'org', key: 'org', side: 'right' },
  { target: 'search', key: 'search', side: 'right' },
  { target: 'nav', key: 'nav', side: 'right' },
  { target: 'new-project', key: 'newProject', side: 'bottom' },
  { target: 'user', key: 'user', side: 'top' },
];

/** The first-visit walkthrough of the workspace, built on driver.js. Stops whose element is not on screen are skipped. */
@Injectable({ providedIn: 'root' })
export class ProductTour {
  private readonly transloco = inject(TranslocoService);
  private readonly onboarding = inject(OnboardingStore);
  private running = false;

  start(): void {
    if (this.running) return;
    const steps: DriveStep[] = [];
    for (const stop of STOPS) {
      const element = visible(stop.target);
      if (!element) continue;
      steps.push({
        element,
        popover: {
          title: this.transloco.translate(`onboarding.tour.${stop.key}.title`),
          description: this.transloco.translate(`onboarding.tour.${stop.key}.body`),
          side: stop.side,
        },
      });
    }
    if (steps.length === 0) return;
    this.running = true;
    const tour = driver({
      showProgress: true,
      allowClose: true,
      steps,
      nextBtnText: this.transloco.translate('onboarding.tour.next'),
      prevBtnText: this.transloco.translate('onboarding.tour.back'),
      doneBtnText: this.transloco.translate('onboarding.tour.done'),
      progressText: this.transloco
        .translate('onboarding.tour.progress')
        .replace('{current}', '{{current}}')
        .replace('{total}', '{{total}}'),
      onDestroyed: () => {
        this.running = false;
        this.onboarding.markTourDone();
      },
    });
    tour.drive();
  }
}

/** The first element with this tour marker that is actually rendered (the sidebar exists twice: desktop and drawer). */
function visible(target: string): Element | null {
  const all = document.querySelectorAll(`[data-tour="${target}"]`);
  for (const el of Array.from(all)) {
    if ((el as HTMLElement).offsetParent !== null) return el;
  }
  return null;
}
