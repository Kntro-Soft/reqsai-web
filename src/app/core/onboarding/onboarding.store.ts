import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';

const WELCOME_KEY = 'reqsai.welcome.dismissed';
const TOUR_KEY = 'reqsai.tour.done';

/**
 * What a newcomer has already seen: the welcome panel (per user and organization, since each
 * organization starts empty) and the guided tour (per user). Kept in the browser only; if storage
 * is unavailable the panel simply shows again.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingStore {
  private readonly auth = inject(AuthStore);
  private readonly revision = signal(0);

  private readonly welcomeKey = computed(() => {
    const user = this.auth.user()?.id;
    const org = this.auth.organizationId();
    return user && org ? `${WELCOME_KEY}.${user}.${org}` : null;
  });
  private readonly tourKey = computed(() => {
    const user = this.auth.user()?.id;
    return user ? `${TOUR_KEY}.${user}` : null;
  });

  readonly welcomeDismissed = computed(() => {
    this.revision();
    const key = this.welcomeKey();
    return key === null || read(key);
  });

  readonly tourDone = computed(() => {
    this.revision();
    const key = this.tourKey();
    return key === null || read(key);
  });

  dismissWelcome(): void {
    this.write(this.welcomeKey());
  }

  markTourDone(): void {
    this.write(this.tourKey());
  }

  private write(key: string | null): void {
    if (key) {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* storage blocked: the hint shows again next visit */
      }
    }
    this.revision.update((n) => n + 1);
  }
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
