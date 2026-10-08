import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCopy, lucideLink, lucideBan } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ShareApiService } from '../../data/share-api.service';
import { ShareLinkResponse } from '../../data/share.models';
import {
  DEFAULT_SHARE_LINK_DAYS,
  SHARE_LINK_DAYS,
  ShareLinkState,
  shareLinkState,
  shareUrl,
} from '../../data/share-links';
import { Modal } from '../../../../shared/components/modal/modal';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';

/**
 * Share the backlog with the client (US50). The analyst creates a link valid for a few days; the
 * client opens it without an account, reads the stories, approves them or comments. The URL is
 * shown once, right after creating it (only its hash is stored); older links are listed with their
 * state and can be revoked.
 */
@Component({
  selector: 'app-share-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, DatePipe, TranslocoPipe, HlmButton, HlmIcon, HlmInput, HlmSpinner],
  viewProviders: [provideIcons({ lucideBan, lucideCheck, lucideCopy, lucideLink })],
  template: `
    <app-modal [(open)]="open">
      <span modalTitle>{{ 'share.title' | transloco }}</span>
      <div class="flex flex-col gap-4" data-testid="share-links">
        <p class="text-sm text-muted-foreground">{{ 'share.description' | transloco }}</p>

        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-foreground" for="share-days">
            {{ 'share.validFor' | transloco }}
          </label>
          <select
            id="share-days"
            class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            [value]="days()"
            (change)="days.set(+$any($event.target).value)"
            data-testid="share-days"
          >
            @for (d of dayOptions; track d) {
              <option [value]="d">{{ 'share.days' | transloco: { count: d } }}</option>
            }
          </select>
          <button
            hlmBtn
            size="sm"
            type="button"
            class="ml-auto"
            (click)="create()"
            [disabled]="creating()"
            data-testid="share-create"
          >
            @if (creating()) {
              <hlm-spinner class="h-4 w-4" />
            } @else {
              <hlm-icon name="lucideLink" size="15px" />
            }
            {{ 'share.create' | transloco }}
          </button>
        </div>

        @if (createdUrl(); as url) {
          <div
            class="flex flex-col gap-2 rounded-xl border border-verified-border bg-verified-soft p-3"
            data-testid="share-created"
          >
            <p class="text-xs font-medium text-verified">{{ 'share.createdHint' | transloco }}</p>
            <div class="flex items-center gap-2">
              <input
                hlmInput
                readonly
                class="h-9 flex-1 font-mono text-xs"
                [value]="url"
                (focus)="$any($event.target).select()"
                data-testid="share-url"
              />
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="copy(url)"
                data-testid="share-copy"
              >
                <hlm-icon [name]="copied() ? 'lucideCheck' : 'lucideCopy'" size="15px" />
                {{ (copied() ? 'share.copied' : 'share.copy') | transloco }}
              </button>
            </div>
          </div>
        }

        @if (error()) {
          <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
        }

        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-foreground">{{ 'share.existing' | transloco }}</h3>
          @if (loading()) {
            <div class="grid place-items-center py-3"><hlm-spinner class="h-5 w-5" /></div>
          } @else if (links().length === 0) {
            <p class="text-xs text-muted-foreground" data-testid="share-none">
              {{ 'share.none' | transloco }}
            </p>
          } @else {
            <ul class="flex flex-col divide-y divide-border rounded-xl border border-border">
              @for (link of links(); track link.id) {
                @let state = stateOf(link);
                <li class="flex items-center gap-3 px-3 py-2" data-testid="share-link-row">
                  <div class="min-w-0 flex-1">
                    <p class="text-xs text-foreground">
                      {{ 'share.createdAt' | transloco }} {{ link.createdAt | date: 'short' }}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      @switch (state) {
                        @case ('active') {
                          {{ 'share.expires' | transloco }} {{ link.expiresAt | date: 'short' }}
                        }
                        @case ('revoked') {
                          {{ 'share.revokedAt' | transloco }} {{ link.revokedAt | date: 'short' }}
                        }
                        @case ('expired') {
                          {{ 'share.expiredAt' | transloco }} {{ link.expiresAt | date: 'short' }}
                        }
                      }
                    </p>
                  </div>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    [class]="stateClass(state)"
                    [attr.data-state]="state"
                    data-testid="share-link-state"
                    >{{ 'share.state.' + state | transloco }}</span
                  >
                  @if (state === 'active') {
                    <button
                      hlmBtn
                      size="sm"
                      variant="ghost"
                      type="button"
                      class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      (click)="revoke(link)"
                      [disabled]="revoking() === link.id"
                      data-testid="share-revoke"
                    >
                      @if (revoking() === link.id) {
                        <hlm-spinner class="h-4 w-4" />
                      } @else {
                        <hlm-icon name="lucideBan" size="14px" />
                      }
                      {{ 'share.revoke' | transloco }}
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
      <button modalFooter hlmBtn size="sm" variant="ghost" type="button" (click)="open.set(false)">
        {{ 'common.close' | transloco }}
      </button>
    </app-modal>
  `,
})
export class ShareLinks {
  private readonly api = inject(ShareApiService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  readonly open = model(false);

  protected readonly dayOptions = SHARE_LINK_DAYS;
  protected readonly days = signal<number>(DEFAULT_SHARE_LINK_DAYS);
  protected readonly links = signal<ShareLinkResponse[]>([]);
  protected readonly loading = signal(false);
  protected readonly creating = signal(false);
  protected readonly revoking = signal<string | null>(null);
  protected readonly createdUrl = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.createdUrl.set(null);
        this.error.set(null);
        this.load();
      }
    });
  }

  protected stateOf(link: ShareLinkResponse): ShareLinkState {
    return shareLinkState(link);
  }

  protected stateClass(state: ShareLinkState): string {
    switch (state) {
      case 'active':
        return 'bg-verified-soft text-verified';
      case 'revoked':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  protected create(): void {
    this.creating.set(true);
    this.error.set(null);
    this.api.createLink(this.projectId(), this.days()).subscribe({
      next: (link) => {
        this.creating.set(false);
        this.copied.set(false);
        if (link.token) this.createdUrl.set(shareUrl(link.token, window.location.origin));
        this.links.update((list) => [link, ...list]);
      },
      error: (err: HttpErrorResponse) => {
        this.creating.set(false);
        this.error.set(messageForError(err, this.transloco));
      },
    });
  }

  protected revoke(link: ShareLinkResponse): void {
    this.revoking.set(link.id);
    this.api.revokeLink(this.projectId(), link.id).subscribe({
      next: (revoked) => {
        this.revoking.set(null);
        this.links.update((list) => list.map((l) => (l.id === revoked.id ? revoked : l)));
      },
      error: (err: HttpErrorResponse) => {
        this.revoking.set(null);
        this.error.set(messageForError(err, this.transloco));
      },
    });
  }

  protected copy(url: string): void {
    void navigator.clipboard?.writeText(url).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.listLinks(this.projectId()).subscribe({
      next: (links) => {
        this.loading.set(false);
        this.links.set(links);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(messageForError(err, this.transloco));
      },
    });
  }
}
