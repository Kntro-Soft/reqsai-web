import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideChevronDown,
  lucideMinus,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';
import { ProfileAdditions, additionsCount, pluralKey } from '../../../discovery/data/codebase';
import {
  FailureEntry,
  SETUP_AUTO_DISMISS_MS,
  canRetry,
  canSkip,
  failureEntries,
  orderedSteps,
  partialFailures,
  setupActive,
  setupFailed,
  setupFinished,
  stepLabelKey,
  stepPercent,
} from '../../data/project-setup';
import { SetupStepResponse } from '../../data/project-setup.models';
import { ProjectSetupStore } from '../../data/project-setup.store';

/**
 * The text of a failed step: each entry's error code translated through the shared `errors.<code>`
 * table (an unknown code or free text is shown as it is), prefixed with the repository it is about.
 */
export function failureText(detail: string | null, transloco: TranslocoService): string {
  return failureEntries(detail)
    .map((entry: FailureEntry) => {
      const key = `errors.${entry.code}`;
      const translated = transloco.translate(key);
      const reason = translated === key ? entry.code : translated;
      return entry.subject ? `${entry.subject}: ${reason}` : reason;
    })
    .join(' · ');
}

/**
 * "Configurando tu proyecto": a slim band under the top bar, on every page of a project created with
 * Jira or GitHub sources, that follows what is being set up in the background (the Jira link and
 * import, the repositories' indexing) while the user keeps working. Each open or failed step can be
 * left out ("Omitir"), a failed one retried, and once the code is indexed the detected stack is one
 * click away. It dismisses itself when everything finished (remembered per project). It is the
 * single driver of {@link ProjectSetupStore}'s project context, from the URL-derived input.
 */
@Component({
  selector: 'app-project-setup-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, HlmButton, HlmIcon, HlmSpinner],
  viewProviders: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideChevronDown,
      lucideMinus,
      lucideX,
    }),
  ],
  template: `
    @if (store.visible()) {
      <section
        data-testid="project-setup-bar"
        [attr.aria-label]="'setup.title' | transloco"
        class="relative shrink-0 border-b border-border bg-secondary/30 px-4 md:px-6"
      >
        <div class="mx-auto flex w-full max-w-5xl flex-col py-2 text-xs">
          <div class="flex flex-wrap items-center gap-x-5 gap-y-0.5">
            <div class="order-1 flex min-h-7 min-w-0 items-center gap-2.5">
              @if (active()) {
                <hlm-spinner class="h-3.5 w-3.5 shrink-0" />
              } @else if (failed()) {
                <hlm-icon
                  name="lucideCircleAlert"
                  size="14px"
                  class="shrink-0 text-destructive"
                  aria-hidden="true"
                />
              } @else {
                <hlm-icon
                  name="lucideCircleCheck"
                  size="14px"
                  class="shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              }
              <h2 class="min-w-0 truncate text-xs font-semibold">
                {{ titleKey() | transloco }}
              </h2>
            </div>

            <div class="order-2 ml-auto flex items-center sm:order-3">
              <button
                type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [attr.aria-expanded]="expanded()"
                aria-controls="project-setup-steps"
                [attr.aria-label]="(expanded() ? 'setup.collapse' : 'setup.expand') | transloco"
                (click)="expanded.set(!expanded())"
                data-testid="project-setup-toggle"
              >
                <hlm-icon
                  name="lucideChevronDown"
                  size="14px"
                  class="transition-transform"
                  [class.rotate-180]="!expanded()"
                />
              </button>
              @if (!active()) {
                <button
                  type="button"
                  class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  [attr.aria-label]="'setup.dismiss' | transloco"
                  (click)="store.dismiss()"
                  data-testid="project-setup-dismiss"
                >
                  <hlm-icon name="lucideX" size="14px" />
                </button>
              }
            </div>

            @if (expanded()) {
              <ul
                id="project-setup-steps"
                class="order-3 flex basis-full flex-col gap-0.5 sm:order-2 sm:basis-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:gap-x-5"
              >
                @for (step of steps(); track step.key) {
                  <li
                    class="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5"
                    [attr.data-testid]="'setup-step-' + step.key"
                    [attr.data-status]="step.status"
                  >
                    <hlm-icon
                      [name]="iconFor(step)"
                      size="14px"
                      [class]="'shrink-0 ' + iconTone(step)"
                      aria-hidden="true"
                    />
                    <span
                      [class.text-muted-foreground]="step.status === 'SKIPPED'"
                      [class.line-through]="step.status === 'SKIPPED'"
                      >{{
                        labelKey(step) | transloco: { done: step.done, total: step.total }
                      }}</span
                    >
                    @if (step.status === 'DONE' && partial(step); as partialCount) {
                      <span class="text-muted-foreground">
                        · {{ 'setup.partial' | transloco: { count: partialCount } }}</span
                      >
                    }
                    @if (step.status === 'FAILED' || step.status === 'DONE') {
                      @if (failure(step); as text) {
                        <span
                          class="basis-full text-muted-foreground sm:basis-auto"
                          [class.text-destructive]="step.status === 'FAILED'"
                          data-testid="setup-step-detail"
                          >{{ text }}</span
                        >
                      }
                    }
                    @if (canWrite()) {
                      @if (canRetry(step)) {
                        <button
                          type="button"
                          class="rounded-sm px-1 font-medium underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          [disabled]="busy()"
                          (click)="retry(step)"
                          data-testid="setup-step-retry"
                        >
                          {{ 'setup.retry' | transloco }}
                        </button>
                      }
                      @if (canSkip(step)) {
                        <button
                          type="button"
                          class="rounded-sm px-1 font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          [disabled]="busy()"
                          (click)="skip(step)"
                          data-testid="setup-step-skip"
                        >
                          {{ 'setup.skip' | transloco }}
                        </button>
                      }
                    }
                  </li>
                }
              </ul>
            }
          </div>

          @if (additions(); as add) {
            @if (!active()) {
              <div
                class="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1"
                data-testid="setup-stack-offer"
              >
                <span class="text-muted-foreground">{{
                  stackKey(add) | transloco: { count: count(add) }
                }}</span>
                @if (canWrite()) {
                  <button
                    hlmBtn
                    size="sm"
                    variant="outline"
                    type="button"
                    class="h-7 px-2.5 text-xs"
                    [disabled]="applying()"
                    (click)="applyStack()"
                    data-testid="setup-stack-apply"
                  >
                    @if (applying()) {
                      <hlm-spinner class="h-3.5 w-3.5" />
                    }
                    {{ 'setup.stack.apply' | transloco }}
                  </button>
                }
              </div>
            }
          }
        </div>

        @if (active()) {
          <div
            class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/60"
            aria-hidden="true"
          >
            @if (percent() !== null) {
              <div
                class="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-out"
                [style.width.%]="percent()"
              ></div>
            } @else {
              <div class="setup-indeterminate h-full w-1/3 rounded-full bg-primary"></div>
            }
          </div>
        }

        <!-- Announces state changes (not every counter tick) to assistive technology. -->
        <p class="sr-only" role="status" aria-live="polite">{{ announcement() }}</p>
      </section>
    }
  `,
  styles: [
    `
      .setup-indeterminate {
        animation: setup-sweep 1.4s ease-in-out infinite;
      }
      @keyframes setup-sweep {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(400%);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .setup-indeterminate {
          animation: none;
          width: 100%;
          opacity: 0.5;
        }
      }
    `,
  ],
})
export class ProjectSetupBar {
  protected readonly store = inject(ProjectSetupStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** The project whose setup to follow, or null outside a project context. */
  readonly projectId = input<string | null>(null);

  protected readonly expanded = signal(true);
  protected readonly busy = signal(false);
  protected readonly applying = signal(false);

  protected readonly steps = computed(() => orderedSteps(this.store.setup()));
  protected readonly active = computed(() => setupActive(this.store.setup()));
  protected readonly failed = computed(() => setupFailed(this.store.setup()));
  protected readonly additions = this.store.stackAdditions;
  protected readonly canWrite = computed(
    () => this.permissions.isOrgOwnerOrAdmin() || this.permissions.has('INTEGRATION_WRITE'),
  );
  protected readonly count = additionsCount;
  protected stackKey(add: ProfileAdditions): string {
    return pluralKey('setup.stack.found', additionsCount(add));
  }
  protected readonly labelKey = stepLabelKey;
  protected readonly canSkip = canSkip;
  protected readonly canRetry = canRetry;

  /** Overall progress: the running step that knows its total (the code, or the import). */
  protected readonly percent = computed(() => {
    const running = this.steps().find((s) => s.status === 'RUNNING' && s.total > 0);
    return running ? stepPercent(running) : null;
  });

  protected readonly titleKey = computed(() => {
    if (this.active()) return 'setup.title';
    if (this.failed()) return 'setup.titleFailed';
    return this.additions() ? 'setup.titleStack' : 'setup.titleDone';
  });

  protected readonly announcement = computed(() => {
    const steps = this.steps();
    if (steps.length === 0) return '';
    const parts = steps.map((s) =>
      this.transloco.translate(
        `setup.step.${s.key}.${s.status === 'PENDING' ? 'RUNNING' : s.status}`,
      ),
    );
    return `${this.transloco.translate(this.titleKey())}. ${parts.join('. ')}`;
  });

  constructor() {
    // Recovery + topic follow the URL. Only drive it for who can read integrations (owner and admin
    // bypass), or the recovery read would 403 on every project page.
    effect(() => {
      const canRead =
        this.permissions.isOrgOwnerOrAdmin() || this.permissions.has('INTEGRATION_READ');
      this.store.setProject(canRead ? this.projectId() : null);
    });

    // Everything settled and nothing left to offer: the bar goes away by itself.
    effect((onCleanup) => {
      const settled = setupFinished(this.store.setup()) && !this.store.dismissed();
      if (!settled || this.additions()) return;
      const timer = setTimeout(() => this.store.dismiss(), SETUP_AUTO_DISMISS_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected iconFor(step: SetupStepResponse): string {
    switch (step.status) {
      case 'DONE':
        return 'lucideCircleCheck';
      case 'FAILED':
        return 'lucideCircleAlert';
      case 'SKIPPED':
        return 'lucideMinus';
      default:
        return 'lucideCircleDashed';
    }
  }

  protected iconTone(step: SetupStepResponse): string {
    switch (step.status) {
      case 'DONE':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'FAILED':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  }

  protected partial(step: SetupStepResponse): number | null {
    return partialFailures(step.detail);
  }

  protected failure(step: SetupStepResponse): string {
    if (partialFailures(step.detail) !== null) return '';
    return failureText(step.detail, this.transloco);
  }

  protected skip(step: SetupStepResponse): void {
    this.run(this.store.skip(step.key));
  }

  protected retry(step: SetupStepResponse): void {
    this.run(this.store.retry(step.key));
  }

  private run(action: ReturnType<ProjectSetupStore['skip']>): void {
    this.busy.set(true);
    action.subscribe({
      next: () => this.busy.set(false),
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
      complete: () => this.busy.set(false),
    });
  }

  protected applyStack(): void {
    const added = this.additions() ? additionsCount(this.additions()!) : 0;
    this.applying.set(true);
    this.store.applyStack().subscribe({
      next: () => {
        this.applying.set(false);
        this.toast.success(
          this.transloco.translate(pluralKey('code.profile.applied', added), { count: added }),
        );
      },
      error: (err: unknown) => {
        this.applying.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
      complete: () => this.applying.set(false),
    });
  }
}
