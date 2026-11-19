import {
  ChangeDetectionStrategy,
  Component,
  effect,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Modal } from '../../../../shared/components/modal/modal';
import { HlmButton } from '../../../../shared/ui';

/**
 * Confirmation the analyst gives before a live capture starts (US70): the meeting's participants
 * consented to be recorded, as Peruvian Law N.° 29733 on personal data protection requires. The
 * capture starts only from "Confirmar e iniciar", which stays disabled (with the reason shown)
 * until the checkbox is ticked; closing the dialog any other way means the consent was not given.
 */
@Component({
  selector: 'app-recording-consent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, TranslocoPipe, HlmButton],
  template: `
    <app-modal [open]="open()" (openChange)="onOpenChange($event)">
      <span modalTitle>{{ 'discovery.consent.title' | transloco }}</span>
      <div class="flex flex-col gap-4" data-testid="recording-consent">
        <p class="text-sm text-muted-foreground">
          {{ 'discovery.consent.description' | transloco }}
        </p>
        <label class="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-primary"
            [checked]="checked()"
            (change)="checked.set($any($event.target).checked)"
            data-autofocus
            data-testid="consent-checkbox"
          />
          {{ 'discovery.consent.checkbox' | transloco }}
        </label>
        @if (!checked()) {
          <p class="text-xs text-muted-foreground" role="status" data-testid="consent-required">
            {{ 'discovery.consent.required' | transloco }}
          </p>
        }
      </div>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="dismiss()"
        data-testid="consent-cancel"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        type="button"
        (click)="confirm()"
        [disabled]="!checked()"
        data-testid="consent-confirm"
      >
        {{ 'discovery.consent.confirm' | transloco }}
      </button>
    </app-modal>
  `,
})
export class RecordingConsent {
  /** Two-way bound visibility. */
  readonly open = model(false);
  /** The analyst confirmed the participants' consent: the capture may start. */
  readonly confirmed = output<void>();
  /** The dialog was closed without confirming: the capture does not start. */
  readonly declined = output<void>();

  protected readonly checked = signal(false);
  private resolved = false;

  constructor() {
    // Every opening asks again: the checkbox never carries over from a previous attempt.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.checked.set(false);
          this.resolved = false;
        });
      }
    });
  }

  protected confirm(): void {
    if (!this.checked()) return;
    this.resolved = true;
    this.open.set(false);
    this.confirmed.emit();
  }

  protected dismiss(): void {
    this.onOpenChange(false);
  }

  /** Backdrop, Escape and Cancel all close the dialog without the consent. */
  protected onOpenChange(open: boolean): void {
    this.open.set(open);
    if (!open && !this.resolved) {
      this.resolved = true;
      this.declined.emit();
    }
  }
}
