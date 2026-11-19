import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCircleAlert, lucideSparkles } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { UserStoryResponse } from '../../data/discovery.models';
import {
  ApplyStoryImprovementResponse,
  StoryImprovementProposal,
  StoryImprovementResponse,
} from '../../data/story-improvement.models';
import {
  ImprovementField,
  cloneProposal,
  hasBlankField,
  hintFor,
  improvementFields,
  isNoChange,
  proposalToRequest,
  proposalTokens,
  snapshotOf,
  withField,
} from '../../data/story-improvement';
import { QualityLevel, clampScore, qualityLevel } from '../../data/story-quality';
import { StoryQualityResponse } from '../../data/story-quality.models';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';

/**
 * "Mejorar con IA" (US73): asks the AI for an improved version of a story and shows it next to the saved one
 * for review. The analyst edits the proposal, fills in every `[[...]]` value the AI could not know and then
 * applies it or discards it; the AI never changes the story by itself. Applying is blocked while a
 * placeholder is left. Emits the saved story and its refreshed quality so the page updates without reloading.
 */
@Component({
  selector: 'app-story-improvement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Modal, HlmButton, HlmIcon, HlmInput, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideArrowRight, lucideCircleAlert, lucideSparkles })],
  template: `
    <button
      hlmBtn
      size="sm"
      variant="outline"
      type="button"
      (click)="request()"
      [disabled]="requesting() || disabled()"
      [attr.aria-busy]="requesting()"
      data-testid="story-improve-open"
    >
      @if (requesting()) {
        <hlm-spinner class="h-4 w-4" />
      } @else {
        <hlm-icon name="lucideSparkles" size="14px" aria-hidden="true" />
      }
      {{ (requesting() ? 'storyImprovement.requesting' : 'storyImprovement.action') | transloco }}
    </button>

    <app-modal [(open)]="opened" size="lg">
      <span modalTitle>{{ 'storyImprovement.title' | transloco }}</span>
      @if (result(); as r) {
        <div class="flex flex-col gap-5 text-foreground" data-testid="story-improve-review">
          <p class="text-sm text-muted-foreground">{{ 'storyImprovement.intro' | transloco }}</p>

          @if (noChange()) {
            <p
              class="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
              data-testid="story-improve-empty"
            >
              {{ 'storyImprovement.noChange' | transloco }}
            </p>
          } @else {
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3"
              role="img"
              [attr.aria-label]="
                'storyImprovement.scoreAria'
                  | transloco: { from: beforeScore(), to: expectedScore() }
              "
              data-testid="story-improve-score"
              [attr.data-level]="expectedLevel()"
            >
              <span class="text-sm font-medium">{{ 'storyImprovement.quality' | transloco }}</span>
              <span
                class="flex items-center gap-2 text-2xl font-bold tabular-nums"
                aria-hidden="true"
              >
                <span
                  [class]="levelTextClass(beforeLevel())"
                  data-testid="story-improve-before-score"
                  >{{ beforeScore() }}</span
                >
                <hlm-icon name="lucideArrowRight" size="18px" class="text-muted-foreground" />
                <span
                  [class]="levelTextClass(expectedLevel())"
                  data-testid="story-improve-after-score"
                  >{{ expectedScore() }}</span
                >
              </span>
              <span class="basis-full text-xs text-muted-foreground sm:basis-auto">
                {{ 'storyImprovement.scoreNote' | transloco }}
              </span>
            </div>

            @if (r.fixes.length > 0) {
              <section>
                <h3 class="text-sm font-semibold">{{ 'storyImprovement.fixes' | transloco }}</h3>
                <ul
                  class="mt-1.5 list-disc space-y-1 pl-5 text-sm"
                  data-testid="story-improve-fixes"
                >
                  @for (fix of r.fixes; track $index) {
                    <li>{{ fix }}</li>
                  }
                </ul>
              </section>
            }

            @if (r.pendingValues.length > 0) {
              <section
                class="rounded-xl border border-pending-border bg-pending-soft px-4 py-3"
                data-testid="story-improve-pending"
              >
                <h3 class="text-sm font-semibold text-pending">
                  {{ 'storyImprovement.pending' | transloco }}
                </h3>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ 'storyImprovement.pendingHint' | transloco }}
                </p>
                <ul class="mt-2 flex flex-col gap-1.5 text-sm">
                  @for (value of r.pendingValues; track value.token) {
                    @let filled = !remaining().includes(value.token);
                    <li
                      class="flex flex-wrap items-baseline gap-x-2"
                      [attr.data-filled]="filled"
                      data-testid="story-improve-pending-item"
                    >
                      <code
                        class="rounded bg-background px-1.5 py-0.5 text-xs font-medium"
                        [class.text-pending]="!filled"
                        [class.text-verified]="filled"
                        [class.line-through]="filled"
                        >{{ value.token }}</code
                      >
                      <span class="text-muted-foreground">{{ value.hint }}</span>
                      @if (filled) {
                        <span class="text-xs font-medium text-verified">{{
                          'storyImprovement.filled' | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              </section>
            }

            <div class="flex flex-col gap-4">
              @for (field of storyFields(); track field.id) {
                <ng-container
                  [ngTemplateOutlet]="fieldTpl"
                  [ngTemplateOutletContext]="{ $implicit: field }"
                />
              }
              @for (group of criteriaGroups(); track group.index) {
                <section
                  class="flex flex-col gap-3 rounded-xl border border-border px-3.5 py-3"
                  data-testid="story-improve-criterion"
                >
                  <h3 class="text-sm font-semibold">
                    {{ 'storyImprovement.criterion' | transloco: { n: group.index + 1 } }}
                  </h3>
                  @for (field of group.fields; track field.id) {
                    <ng-container
                      [ngTemplateOutlet]="fieldTpl"
                      [ngTemplateOutletContext]="{ $implicit: field }"
                    />
                  }
                </section>
              }
              @if (removedCriteria() > 0) {
                <p class="text-xs text-muted-foreground" data-testid="story-improve-removed">
                  {{ 'storyImprovement.removedCriteria' | transloco: { count: removedCriteria() } }}
                </p>
              }
            </div>

            @if (applyError(); as message) {
              <p
                class="flex items-start gap-2 text-sm text-destructive"
                role="alert"
                data-testid="story-improve-error"
              >
                <hlm-icon
                  name="lucideCircleAlert"
                  size="16px"
                  class="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                {{ message }}
              </p>
            }
            @if (blockedReason(); as reason) {
              <p
                class="text-sm text-pending"
                id="story-improve-blocked"
                data-testid="story-improve-blocked"
              >
                {{ reason.key | transloco: { count: reason.count } }}
              </p>
            }
          }
        </div>
      }

      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        [disabled]="applying()"
        (click)="discard()"
        data-testid="story-improve-discard"
      >
        {{ 'storyImprovement.discard' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        type="button"
        [disabled]="!canApply()"
        [attr.aria-describedby]="blockedReason() ? 'story-improve-blocked' : null"
        (click)="apply()"
        data-testid="story-improve-apply"
      >
        @if (applying()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'storyImprovement.apply' | transloco }}
      </button>
    </app-modal>

    <ng-template #fieldTpl let-field>
      <div
        class="flex flex-col gap-1.5"
        [attr.data-field]="field.id"
        [attr.data-changed]="field.changed"
        data-testid="story-improve-field"
      >
        <div class="flex items-center gap-2">
          <label
            class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            [for]="'improve-' + field.id"
            >{{ 'storyImprovement.field.' + field.key | transloco }}</label
          >
          @if (field.changed) {
            <span
              class="rounded-full bg-verified-soft px-2 py-0.5 text-[11px] font-medium text-verified"
              >{{ 'storyImprovement.changed' | transloco }}</span
            >
          }
        </div>
        <div class="grid gap-2 md:grid-cols-2">
          <div class="min-w-0">
            <span class="mb-1 block text-[11px] text-muted-foreground">{{
              'storyImprovement.before' | transloco
            }}</span>
            <p
              class="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
              [class.text-muted-foreground]="!field.before"
              data-testid="story-improve-before"
            >
              {{ field.before || ('storyImprovement.empty' | transloco) }}
            </p>
          </div>
          <div class="min-w-0">
            <span class="mb-1 block text-[11px] text-muted-foreground">{{
              'storyImprovement.after' | transloco
            }}</span>
            <textarea
              hlmInput
              rows="1"
              [class]="afterClass(field)"
              [id]="'improve-' + field.id"
              [value]="field.after"
              [attr.data-autofocus]="field.id === focusId() ? '' : null"
              [attr.aria-invalid]="field.tokens.length > 0"
              (input)="edit(field, $any($event.target).value)"
              data-testid="story-improve-after"
            ></textarea>
            @for (token of field.tokens; track token) {
              <p class="mt-1 text-xs text-pending" data-testid="story-improve-token">
                <code class="rounded bg-pending-soft px-1 py-0.5 font-medium">{{ token }}</code>
                {{ hintOf(token) || ('storyImprovement.fillIn' | transloco) }}
              </p>
            }
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class StoryImprovement {
  private readonly api = inject(DiscoveryApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();
  /** The story as saved today: the "before" of the review. */
  readonly story = input<UserStoryResponse | null>(null);
  /** The current quality: where the score starts. */
  readonly quality = input<StoryQualityResponse | null>(null);
  /** Lets the parent hold the button while it is busy (e.g. an evaluation is running). */
  readonly disabled = input(false);
  /** The story as saved and its refreshed quality, once the analyst applied the proposal. */
  readonly applied = output<ApplyStoryImprovementResponse>();

  protected readonly opened = signal(false);
  protected readonly requesting = signal(false);
  protected readonly applying = signal(false);
  protected readonly applyError = signal<string | null>(null);
  protected readonly result = signal<StoryImprovementResponse | null>(null);
  /** What the AI proposed with the analyst's edits and filled-in values. */
  private readonly draft = signal<StoryImprovementProposal | null>(null);
  /** The saved story the proposal is compared against, frozen when the proposal arrives. */
  private readonly before = signal(snapshotOf(null));

  protected readonly fields = computed<ImprovementField[]>(() => {
    const draft = this.draft();
    return draft ? improvementFields(this.before(), draft) : [];
  });
  protected readonly storyFields = computed(() =>
    this.fields().filter((f) => f.criterion === null),
  );
  protected readonly criteriaGroups = computed(() => {
    const groups = new Map<number, ImprovementField[]>();
    for (const f of this.fields()) {
      if (f.criterion === null) continue;
      groups.set(f.criterion, [...(groups.get(f.criterion) ?? []), f]);
    }
    return Array.from(groups, ([index, fields]) => ({ index, fields }));
  });
  /** Saved criteria the proposal has no counterpart for: applying drops them. */
  protected readonly removedCriteria = computed(() =>
    Math.max(
      0,
      this.before().acceptanceCriteria.length - (this.draft()?.acceptanceCriteria.length ?? 0),
    ),
  );
  /** The placeholders still in the text. */
  protected readonly remaining = computed(() => {
    const draft = this.draft();
    return draft ? proposalTokens(draft) : [];
  });
  protected readonly noChange = computed(() => {
    const result = this.result();
    return !!result && isNoChange(this.before(), result.proposal);
  });
  /** The first thing to look at: the first field with a pending value, else the title. */
  protected readonly focusId = computed(
    () => this.fields().find((f) => f.tokens.length > 0)?.id ?? 'title',
  );
  protected readonly beforeScore = computed(() => clampScore(this.quality()?.score ?? 0));
  protected readonly expectedScore = computed(() =>
    clampScore(this.result()?.expectedQuality.score ?? 0),
  );
  protected readonly beforeLevel = computed(() => qualityLevel(this.beforeScore()));
  protected readonly expectedLevel = computed(() => qualityLevel(this.expectedScore()));

  /** Why Apply is not available yet, or null when it is. */
  protected readonly blockedReason = computed<{ key: string; count: number } | null>(() => {
    const draft = this.draft();
    if (!draft || this.noChange()) return null;
    const left = this.remaining().length;
    if (left > 0) return { key: 'storyImprovement.blockedPending', count: left };
    if (hasBlankField(draft)) return { key: 'storyImprovement.blockedBlank', count: 0 };
    return null;
  });
  protected readonly canApply = computed(
    () => !!this.draft() && !this.noChange() && this.blockedReason() === null && !this.applying(),
  );

  /** Asks the AI for a proposal; the review opens once it arrives. */
  protected request(): void {
    if (this.requesting()) return;
    this.requesting.set(true);
    this.api
      .improveStory(this.projectId(), this.storyId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.requesting.set(false);
          this.before.set(snapshotOf(this.story()));
          this.result.set(response);
          this.draft.set(cloneProposal(response.proposal));
          this.applyError.set(null);
          this.opened.set(true);
        },
        error: (err: unknown) => {
          this.requesting.set(false);
          this.toast.error(messageForError(err, this.transloco));
        },
      });
  }

  protected edit(field: ImprovementField, value: string): void {
    const draft = this.draft();
    if (draft) this.draft.set(withField(draft, field, value));
  }

  /** Closes the review without touching the story. */
  protected discard(): void {
    this.opened.set(false);
  }

  protected apply(): void {
    const draft = this.draft();
    if (!draft || !this.canApply()) return;
    this.applying.set(true);
    this.applyError.set(null);
    this.api
      .applyStoryImprovement(this.projectId(), this.storyId(), proposalToRequest(draft))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.applying.set(false);
          this.opened.set(false);
          this.toast.success(this.transloco.translate('storyImprovement.applied'));
          this.applied.emit(response);
        },
        error: (err: unknown) => {
          this.applying.set(false);
          // Stays open: the analyst's edits are not lost and can be corrected.
          this.applyError.set(messageForError(err, this.transloco));
        },
      });
  }

  protected hintOf(token: string): string | null {
    return hintFor(token, this.result()?.pendingValues ?? []);
  }

  protected afterClass(field: ImprovementField): string {
    if (field.tokens.length > 0) return 'min-h-10 border-pending bg-pending-soft';
    if (field.changed) return 'min-h-10 border-verified-border bg-verified-soft';
    return 'min-h-10';
  }

  protected levelTextClass(level: QualityLevel): string {
    return { GOOD: 'text-verified', FAIR: 'text-pending', POOR: 'text-destructive' }[level];
  }
}
