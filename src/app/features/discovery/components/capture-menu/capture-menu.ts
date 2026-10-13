import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideEllipsis,
  lucideHistory,
  lucideShare2,
  lucideUpload,
  lucideUsers,
} from '@ng-icons/lucide';
import { MenuKeys } from '../../../../shared/components/popover/menu-keys';
import { BELOW_END } from '../../../../shared/components/popover/popover-positions';
import { HlmButton, HlmIcon } from '../../../../shared/ui';

/**
 * The capture page's secondary actions behind one "⋯" button, so the header carries one compact
 * control instead of a row of labelled buttons: upload a past recording, the session history and
 * the speakers of the current (live or latest) session. Each entry appears only when it applies.
 */
@Component({
  selector: 'app-capture-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, RouterLink, TranslocoPipe, HlmButton, HlmIcon, MenuKeys],
  viewProviders: [
    provideIcons({ lucideEllipsis, lucideHistory, lucideShare2, lucideUpload, lucideUsers }),
  ],
  host: { class: 'block shrink-0' },
  template: `
    <button
      #trigger
      type="button"
      hlmBtn
      variant="outline"
      size="sm"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="open.set(!open())"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'discovery.menu.label' | transloco"
      [title]="'discovery.menu.label' | transloco"
      class="w-8 px-0"
      data-testid="capture-menu"
    >
      <hlm-icon name="lucideEllipsis" size="16px" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close(false)"
      (detach)="close(false)"
    >
      <div
        role="menu"
        appMenuKeys
        (dismiss)="close(true)"
        [attr.aria-label]="'discovery.menu.label' | transloco"
        class="capture-menu w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        data-testid="capture-menu-panel"
      >
        @if (speakers()) {
          <button
            type="button"
            role="menuitem"
            (click)="pick(speakersRequested)"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            data-testid="speakers-menu"
          >
            <hlm-icon name="lucideUsers" size="16px" class="text-muted-foreground" />
            {{
              (canEditSpeakers() ? 'discovery.speakers.edit' : 'discovery.speakers.view')
                | transloco
            }}
          </button>
        }
        @if (canShare()) {
          <button
            type="button"
            role="menuitem"
            (click)="pick(shareRequested)"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            data-testid="share-session-open"
          >
            <hlm-icon name="lucideShare2" size="16px" class="text-muted-foreground" />
            {{ 'share.session.action' | transloco }}
          </button>
        }
        @if (canUpload()) {
          <button
            type="button"
            role="menuitem"
            (click)="pick(uploadRequested)"
            [disabled]="uploadBlocked()"
            [attr.title]="uploadBlocked() ? ('discovery.upload.quotaBlocked' | transloco) : null"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            data-testid="upload-recording-open"
          >
            <hlm-icon name="lucideUpload" size="16px" class="text-muted-foreground" />
            <span class="flex flex-col">
              {{ 'discovery.upload.button' | transloco }}
              @if (uploadBlocked()) {
                <span class="text-xs text-muted-foreground">{{
                  'discovery.upload.quotaBlocked' | transloco
                }}</span>
              }
            </span>
          </button>
        }
        <a
          role="menuitem"
          [routerLink]="['history']"
          (click)="close(false)"
          class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          data-testid="discovery-history"
        >
          <hlm-icon name="lucideHistory" size="16px" class="text-muted-foreground" />
          {{ 'discovery.history.button' | transloco }}
        </a>
      </div>
    </ng-template>
  `,
  styles: `
    @media (prefers-reduced-motion: no-preference) {
      .capture-menu {
        transform-origin: top right;
        animation: capture-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
      }
    }
    @keyframes capture-menu-in {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
      }
    }
  `,
})
export class CaptureMenu {
  /** Offer "Upload a recording" (recorders, while no session is live). */
  readonly canUpload = input(false);
  /** The monthly AI allowance is spent: processing a recording would be refused. */
  readonly uploadBlocked = input(false);
  /** Offer the speakers of the current session (it has diarized voices). */
  readonly speakers = input(false);
  /** The speakers entry reads "Edit" for people who can change them, else "View". */
  readonly canEditSpeakers = input(false);

  /** Offer sharing the current (live or latest) session through a link. */
  readonly canShare = input(false);

  readonly uploadRequested = output<void>();
  readonly shareRequested = output<void>();
  readonly speakersRequested = output<void>();

  protected readonly positions = BELOW_END;
  protected readonly open = signal(false);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected pick(action: { emit: () => void }): void {
    this.close(true);
    action.emit();
  }

  /** Closes the menu; keyboard and selection hand focus back to the button. */
  protected close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }
}
