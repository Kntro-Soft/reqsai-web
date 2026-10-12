import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { WelcomePanel } from './welcome-panel';

describe('WelcomePanel', () => {
  let fixture: ComponentFixture<WelcomePanel>;
  const admin = signal(true);

  function el(testid: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        WelcomePanel,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: PermissionsStore, useValue: { isOrgOwnerOrAdmin: admin } },
      ],
    });
    admin.set(true);
    fixture = TestBed.createComponent(WelcomePanel);
  });

  it('offers the demo only when the organization has one', () => {
    fixture.detectChanges();
    expect(el('welcome-demo')).toBeNull();
    fixture.componentRef.setInput('demoProjectId', 'p1');
    fixture.detectChanges();
    expect(el('welcome-demo')?.getAttribute('href')).toBe('/projects/p1');
  });

  it('lets admins connect integrations but not plain members', () => {
    fixture.detectChanges();
    expect(el('welcome-connect')).not.toBeNull();
    admin.set(false);
    fixture.detectChanges();
    expect(el('welcome-connect')).toBeNull();
  });

  it('emits dismiss and tour requests', () => {
    const dismissed = vi.fn();
    const tour = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentInstance.tourRequested.subscribe(tour);
    fixture.detectChanges();
    el('welcome-dismiss')?.click();
    el('welcome-tour')?.click();
    expect(dismissed).toHaveBeenCalled();
    expect(tour).toHaveBeenCalled();
  });
});
