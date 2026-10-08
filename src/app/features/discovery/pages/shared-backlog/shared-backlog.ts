import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheckBig,
  lucideLink2Off,
  lucideMessageSquare,
  lucideSend,
  lucideThumbsUp,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ShareApiService } from '../../data/share-api.service';
import {
  SharedBacklogResponse,
  SharedStoryResponse,
  StoryFeedbackKind,
} from '../../data/share.models';
import { readSavedAuthor, saveAuthor } from '../../data/share-links';
import { PriorityBadge, StoryStatusBadge } from '../../components/story-badges/story-badges';
import { messageForError } from '../../../../core/errors/error-message';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

type View = 'loading' | 'unavailable' | 'ready';

/** Longest comment and name the backend accepts. */
const COMMENT_MAX = 2000;
const AUTHOR_MAX = 120;

/**
 * The client's page for a share link (US50): chrome-less and public, like the invitation landing.
 * The client signs with a name once (remembered on this device), reads each story with its
 * acceptance criteria, and approves it or leaves a comment. Feedback reaches the team without
 * changing the story's status. Unknown, revoked and expired links all show the same dead-end.
 */
@Component({
  selector: 'app-shared-backlog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TranslocoPipe,
    PriorityBadge,
    StoryStatusBadge,
    ThemeToggle,
    LanguageSwitcher,
    Logo,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideCircleCheckBig,
      lucideLink2Off,
      lucideMessageSquare,
      lucideSend,
      lucideThumbsUp,
    }),
  ],
  template: `
    <div class="min-h-dvh bg-background text-foreground">
      <header
        class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6"
      >
        <app-logo [size]="26" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
        </div>
      </header>

      <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        @switch (view()) {
          @case ('loading') {
            <div class="grid place-items-center py-24" data-testid="shared-loading">
              <hlm-spinner class="h-7 w-7" />
            </div>
          }

          @case ('unavailable') {
            <div
              class="flex flex-col items-center gap-3 py-24 text-center"
              data-testid="shared-unavailable"
            >
              <span
                class="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"
              >
                <hlm-icon name="lucideLink2Off" size="24px" />
              </span>
              <h1 class="text-xl font-bold tracking-tight">
                {{ 'share.public.unavailableTitle' | transloco }}
              </h1>
              <p class="max-w-sm text-sm text-muted-foreground">
                {{ 'share.public.unavailableBody' | transloco }}
              </p>
            </div>
          }

          @case ('ready') {
            @let b = backlog()!;
            <div class="flex flex-col gap-1">
              <p class="text-xs font-medium uppercase tracking-wide text-primary">
                {{ 'share.public.eyebrow' | transloco }}
              </p>
              <h1 class="text-2xl font-bold tracking-tight" data-testid="shared-project">
                {{ b.projectName }}
              </h1>
              <p class="text-sm text-muted-foreground">
                {{ 'share.public.intro' | transloco }}
                {{ 'share.public.until' | transloco }} {{ b.expiresAt | date: 'mediumDate' }}.
              </p>
            </div>

            <div class="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4">
              <label hlmLabel for="shared-author">{{ 'share.public.yourName' | transloco }}</label>
              <input
                hlmInput
                id="shared-author"
                [maxLength]="authorMax"
                [value]="author()"
                (input)="author.set($any($event.target).value)"
                (blur)="rememberAuthor()"
                [placeholder]="'share.public.namePlaceholder' | transloco"
                data-testid="shared-author"
              />
              <p class="text-xs text-muted-foreground">{{ 'share.public.nameHint' | transloco }}</p>
            </div>

            @if (b.stories.length === 0) {
              <p
                class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
                data-testid="shared-empty"
              >
                {{ 'share.public.empty' | transloco }}
              </p>
            }

            @for (story of b.stories; track story.id; let i = $index) {
              <article
                class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
                [attr.data-story-id]="story.id"
                data-testid="shared-story"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <h2 class="text-base font-semibold" data-testid="shared-story-title">
                    <span class="mr-1 text-muted-foreground tabular-nums">{{ i + 1 }}.</span>
                    {{ story.title }}
                  </h2>
                  <div class="flex items-center gap-1.5">
                    <app-priority-badge [priority]="story.priority" size="sm" />
                    <app-story-status-badge [status]="story.status" />
                  </div>
                </div>
                <p class="text-sm leading-relaxed">
                  <span class="text-muted-foreground">{{ 'share.public.asA' | transloco }}</span>
                  {{ story.role }},
                  <span class="text-muted-foreground">{{ 'share.public.iWant' | transloco }}</span>
                  {{ story.action }},
                  <span class="text-muted-foreground">{{ 'share.public.soThat' | transloco }}</span>
                  {{ story.benefit }}.
                </p>

                @if (story.acceptanceCriteria.length > 0) {
                  <div class="flex flex-col gap-2">
                    <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {{ 'share.public.criteria' | transloco }}
                    </h3>
                    <ol class="flex flex-col gap-2">
                      @for (c of story.acceptanceCriteria; track c.id) {
                        <li class="rounded-xl bg-muted/50 px-3 py-2 text-sm leading-relaxed">
                          <span class="font-semibold">{{ 'share.public.given' | transloco }}</span>
                          {{ c.given }}
                          <span class="font-semibold">{{ 'share.public.when' | transloco }}</span>
                          {{ c.when }}
                          <span class="font-semibold">{{ 'share.public.then' | transloco }}</span>
                          {{ c.then }}
                        </li>
                      }
                    </ol>
                  </div>
                }

                @if (story.feedback.length > 0) {
                  <ul class="flex flex-col gap-2 border-t border-border pt-3">
                    @for (entry of story.feedback; track entry.id) {
                      <li class="flex gap-2 text-sm" data-testid="shared-feedback">
                        <hlm-icon
                          [name]="
                            entry.kind === 'APPROVAL'
                              ? 'lucideCircleCheckBig'
                              : 'lucideMessageSquare'
                          "
                          size="15px"
                          class="mt-0.5 shrink-0"
                          [class.text-verified]="entry.kind === 'APPROVAL'"
                          [class.text-muted-foreground]="entry.kind !== 'APPROVAL'"
                        />
                        <div class="min-w-0">
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
                            <p class="whitespace-pre-line">{{ entry.comment }}</p>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                }

                @if (commenting() === story.id) {
                  <div class="flex flex-col gap-2">
                    <textarea
                      hlmInput
                      rows="3"
                      [maxLength]="commentMax"
                      [value]="draft()"
                      (input)="draft.set($any($event.target).value)"
                      [placeholder]="'share.public.commentPlaceholder' | transloco"
                      data-testid="shared-comment-input"
                    ></textarea>
                    <div class="flex justify-end gap-2">
                      <button
                        hlmBtn
                        size="sm"
                        variant="ghost"
                        type="button"
                        (click)="commenting.set(null)"
                      >
                        {{ 'common.cancel' | transloco }}
                      </button>
                      <button
                        hlmBtn
                        size="sm"
                        type="button"
                        [disabled]="busy() === story.id || !draft().trim()"
                        (click)="send(story, 'COMMENT')"
                        data-testid="shared-comment-send"
                      >
                        @if (busy() === story.id) {
                          <hlm-spinner class="h-4 w-4" />
                        } @else {
                          <hlm-icon name="lucideSend" size="14px" />
                        }
                        {{ 'share.public.send' | transloco }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    @if (approvedByMe(story)) {
                      <span
                        class="mr-auto text-xs font-medium text-verified"
                        data-testid="shared-approved-by-me"
                        >{{ 'share.public.approvedByYou' | transloco }}</span
                      >
                    }
                    <button
                      hlmBtn
                      size="sm"
                      variant="outline"
                      type="button"
                      (click)="startComment(story)"
                      data-testid="shared-comment"
                    >
                      <hlm-icon name="lucideMessageSquare" size="14px" />
                      {{ 'share.public.comment' | transloco }}
                    </button>
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      [disabled]="busy() === story.id || approvedByMe(story)"
                      (click)="send(story, 'APPROVAL')"
                      data-testid="shared-approve"
                    >
                      @if (busy() === story.id) {
                        <hlm-spinner class="h-4 w-4" />
                      } @else {
                        <hlm-icon name="lucideThumbsUp" size="14px" />
                      }
                      {{ 'share.public.approve' | transloco }}
                    </button>
                  </div>
                }
                @if (errorFor() === story.id && error()) {
                  <p class="text-sm text-destructive" role="alert" data-testid="shared-error">
                    {{ error() }}
                  </p>
                }
              </article>
            }

            <p class="pb-6 text-center text-xs text-muted-foreground">
              {{ 'share.public.footer' | transloco }}
            </p>
          }
        }
      </main>
    </div>
  `,
})
export class SharedBacklog implements OnInit {
  private readonly api = inject(ShareApiService);
  private readonly transloco = inject(TranslocoService);

  /** Bound from the route via withComponentInputBinding(). */
  readonly token = input.required<string>();

  protected readonly commentMax = COMMENT_MAX;
  protected readonly authorMax = AUTHOR_MAX;
  protected readonly backlog = signal<SharedBacklogResponse | null>(null);
  protected readonly unavailable = signal(false);
  protected readonly view = computed<View>(() =>
    this.unavailable() ? 'unavailable' : this.backlog() ? 'ready' : 'loading',
  );
  protected readonly author = signal(readSavedAuthor());
  protected readonly commenting = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly errorFor = signal<string | null>(null);

  ngOnInit(): void {
    this.api.openShared(this.token()).subscribe({
      next: (backlog) => this.backlog.set(backlog),
      error: () => this.unavailable.set(true),
    });
  }

  protected rememberAuthor(): void {
    if (this.author().trim()) saveAuthor(this.author());
  }

  protected approvedByMe(story: SharedStoryResponse): boolean {
    const me = this.author().trim().toLowerCase();
    return (
      !!me && story.feedback.some((f) => f.kind === 'APPROVAL' && f.authorName.toLowerCase() === me)
    );
  }

  protected startComment(story: SharedStoryResponse): void {
    this.draft.set('');
    this.error.set(null);
    this.commenting.set(story.id);
  }

  protected send(story: SharedStoryResponse, kind: StoryFeedbackKind): void {
    const authorName = this.author().trim();
    this.errorFor.set(story.id);
    if (!authorName) {
      this.error.set(this.transloco.translate('share.public.nameRequired'));
      return;
    }
    this.error.set(null);
    this.busy.set(story.id);
    saveAuthor(authorName);
    const comment = kind === 'COMMENT' ? this.draft().trim() : null;
    this.api.leaveFeedback(this.token(), story.id, { kind, authorName, comment }).subscribe({
      next: (entry) => {
        this.busy.set(null);
        this.commenting.set(null);
        this.backlog.update((b) =>
          b
            ? {
                ...b,
                stories: b.stories.map((s) =>
                  s.id === story.id ? { ...s, feedback: [...s.feedback, entry] } : s,
                ),
              }
            : b,
        );
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        if (err.status === 404 && err.error?.code === 'SHARE_LINK_UNAVAILABLE') {
          this.unavailable.set(true);
          return;
        }
        this.error.set(messageForError(err, this.transloco));
      },
    });
  }
}
