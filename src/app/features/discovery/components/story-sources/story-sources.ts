import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideClock,
  lucideFileSearch,
  lucideMic,
  lucideQuote,
} from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { StorySourcesResponse } from '../../data/story-sources.models';
import { fragmentMoment, fragmentSessionParams } from '../../data/story-sources';
import { Modal } from '../../../../shared/components/modal/modal';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * "Ver origen" (US72): from a story, the fragments of the meetings it comes from, to check that it
 * reflects what was agreed with the client. Each fragment shows the session it was said in, the moment
 * of the meeting, who said it and the transcript text. A story created by hand says it does not come from
 * a session; a story generated before fragments were stored says its origin is not available.
 * The sources are read each time the dialog opens.
 */
@Component({
  selector: 'app-story-sources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Modal, HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [
    provideIcons({ lucideArrowUpRight, lucideClock, lucideFileSearch, lucideMic, lucideQuote }),
  ],
  template: `
    <button
      hlmBtn
      size="sm"
      variant="outline"
      type="button"
      (click)="show()"
      data-testid="story-sources-open"
    >
      <hlm-icon name="lucideFileSearch" size="15px" aria-hidden="true" />
      {{ 'storySources.action' | transloco }}
    </button>

    <app-modal [(open)]="opened">
      <span modalTitle>{{ 'storySources.title' | transloco }}</span>
      @if (loading()) {
        <div class="grid place-items-center py-6" data-testid="story-sources-loading">
          <hlm-spinner class="h-5 w-5" />
        </div>
      } @else if (failed()) {
        <div
          class="flex flex-wrap items-center gap-3"
          role="alert"
          data-testid="story-sources-error"
        >
          <p class="text-destructive">{{ 'storySources.loadError' | transloco }}</p>
          <button hlmBtn size="sm" variant="outline" type="button" (click)="load()">
            {{ 'discovery.retry' | transloco }}
          </button>
        </div>
      } @else if (sources(); as data) {
        @switch (data.origin) {
          @case ('MANUAL') {
            <p
              class="rounded-xl border border-dashed border-border px-3 py-4"
              data-testid="story-sources-manual"
            >
              {{ 'storySources.manual' | transloco }}
            </p>
          }
          @case ('UNAVAILABLE') {
            <div
              class="flex flex-col gap-2 rounded-xl border border-dashed border-border px-3 py-4"
              data-testid="story-sources-unavailable"
            >
              <p>{{ 'storySources.unavailable' | transloco }}</p>
              @if (data.sessionId) {
                <a
                  [routerLink]="['/projects', projectId(), 'sessions']"
                  [queryParams]="{ session: data.sessionId }"
                  (click)="opened.set(false)"
                  class="inline-flex w-fit items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline"
                  data-testid="story-sources-unavailable-session"
                >
                  {{
                    data.sessionTitle
                      ? ('storySources.session' | transloco: { title: data.sessionTitle })
                      : ('storyForm.viewSession' | transloco)
                  }}
                  <hlm-icon name="lucideArrowUpRight" size="12px" aria-hidden="true" />
                </a>
              }
            </div>
          }
          @default {
            <p class="text-xs">{{ 'storySources.hint' | transloco }}</p>
            <ol class="flex flex-col gap-3" data-testid="story-sources-list">
              @for (fragment of data.fragments; track fragment.id) {
                <li
                  class="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3"
                  data-testid="story-source"
                >
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    @if (moment(fragment); as at) {
                      <span
                        class="inline-flex items-center gap-1 font-medium tabular-nums text-foreground"
                        data-testid="story-source-moment"
                      >
                        <hlm-icon name="lucideClock" size="12px" aria-hidden="true" />
                        {{ 'storySources.moment' | transloco: { time: at } }}
                      </span>
                    } @else {
                      <span class="text-pending" data-testid="story-source-not-located">
                        {{ 'storySources.notLocated' | transloco }}
                      </span>
                    }
                    @if (fragment.speakerName) {
                      <span
                        class="inline-flex items-center gap-1"
                        data-testid="story-source-speaker"
                      >
                        <hlm-icon name="lucideMic" size="12px" aria-hidden="true" />
                        {{ fragment.speakerName }}
                      </span>
                    }
                  </div>
                  <blockquote class="flex items-start gap-2.5 leading-relaxed text-foreground">
                    <hlm-icon
                      name="lucideQuote"
                      size="15px"
                      class="mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <q class="min-w-0" data-testid="story-source-text">{{
                      fragment.transcriptText || fragment.quote
                    }}</q>
                  </blockquote>
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span data-testid="story-source-session">
                      {{ fragment.sessionTitle ?? ('storySources.sessionGone' | transloco) }}
                      @if (fragment.sessionStartedAt) {
                        · {{ fragment.sessionStartedAt | date: 'short' }}
                      }
                    </span>
                    @if (fragment.sessionTitle) {
                      <a
                        [routerLink]="['/projects', projectId(), 'sessions']"
                        [queryParams]="params(fragment)"
                        (click)="opened.set(false)"
                        class="inline-flex items-center gap-1 rounded-md font-medium text-primary hover:underline"
                        data-testid="story-source-link"
                      >
                        {{ 'storyForm.origin.viewInSession' | transloco }}
                        <hlm-icon name="lucideArrowUpRight" size="12px" aria-hidden="true" />
                      </a>
                    }
                  </div>
                </li>
              }
            </ol>
          }
        }
      }
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="opened.set(false)"
        data-testid="story-sources-close"
      >
        {{ 'common.close' | transloco }}
      </button>
    </app-modal>
  `,
})
export class StorySources {
  private readonly api = inject(DiscoveryApiService);

  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();

  protected readonly opened = signal(false);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly sources = signal<StorySourcesResponse | null>(null);

  protected readonly moment = fragmentMoment;
  protected readonly params = fragmentSessionParams;

  protected show(): void {
    this.opened.set(true);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.getStorySources(this.projectId(), this.storyId()).subscribe({
      next: (sources) => {
        this.sources.set(sources);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
