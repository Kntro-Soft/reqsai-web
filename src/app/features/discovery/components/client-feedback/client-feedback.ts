import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleCheckBig, lucideMessageSquare } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { ShareApiService } from '../../data/share-api.service';
import { StoryFeedbackResponse } from '../../data/share.models';
import { HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * What clients said about a story through share links (US50): approvals and comments, oldest first.
 * Read-only for the team; the review decision itself stays in the story header.
 */
@Component({
  selector: 'app-client-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TranslocoPipe, HlmIcon, HlmSpinner],
  viewProviders: [provideIcons({ lucideCircleCheckBig, lucideMessageSquare })],
  template: `
    <section
      class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
      data-testid="client-feedback"
    >
      <div>
        <h2 class="text-base font-semibold">
          {{ 'share.feedback.title' | transloco }}
          <span class="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{{
            feedback().length
          }}</span>
        </h2>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ 'share.feedback.hint' | transloco }}</p>
      </div>
      @if (loading()) {
        <div class="grid place-items-center py-2"><hlm-spinner class="h-5 w-5" /></div>
      } @else if (feedback().length === 0) {
        <p
          class="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
          data-testid="client-feedback-empty"
        >
          {{ 'share.feedback.empty' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (entry of feedback(); track entry.id) {
            <li
              class="flex gap-3 rounded-xl border border-border px-3 py-2.5"
              [attr.data-kind]="entry.kind"
              data-testid="client-feedback-entry"
            >
              <hlm-icon
                [name]="entry.kind === 'APPROVAL' ? 'lucideCircleCheckBig' : 'lucideMessageSquare'"
                size="16px"
                class="mt-0.5 shrink-0"
                [class.text-verified]="entry.kind === 'APPROVAL'"
                [class.text-muted-foreground]="entry.kind !== 'APPROVAL'"
              />
              <div class="min-w-0 flex-1">
                <p class="text-xs text-muted-foreground">
                  <span class="font-medium text-foreground">{{ entry.authorName }}</span>
                  ·
                  {{
                    (entry.kind === 'APPROVAL'
                      ? 'share.feedback.approved'
                      : 'share.feedback.commented'
                    ) | transloco
                  }}
                  · {{ entry.createdAt | date: 'short' }}
                </p>
                @if (entry.comment) {
                  <p class="mt-1 whitespace-pre-line text-sm text-foreground">
                    {{ entry.comment }}
                  </p>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ClientFeedback implements OnInit {
  private readonly api = inject(ShareApiService);

  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();

  protected readonly feedback = signal<StoryFeedbackResponse[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.api.storyFeedback(this.projectId(), this.storyId()).subscribe({
      next: (list) => {
        this.feedback.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
