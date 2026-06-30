import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import { lucideMic } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryStore } from '../../data/discovery.store';
import { statusVariant } from '../../data/session-ui';
import { FromNowPipe } from '../../../../shared/pipes/from-now.pipe';
import {
  HlmBadge,
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

@Component({
  selector: 'app-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmBadge,
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    HlmIcon,
    DatePipe,
    FromNowPipe,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideMic })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'sessions.title' | transloco }}</h1>
          <p class="text-sm text-muted-foreground">{{ 'sessions.subtitle' | transloco }}</p>
        </div>
        <button hlmBtn type="button" (click)="showForm.set(!showForm())">
          {{ (showForm() ? 'common.cancel' : 'sessions.new') | transloco }}
        </button>
      </div>

      @if (showForm()) {
        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'sessions.formTitle' | transloco }}</h2>
          </div>
          <div hlmCardContent>
            <form
              [formGroup]="form"
              (ngSubmit)="submit()"
              class="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div class="flex flex-1 flex-col gap-2">
                <label hlmLabel for="title">{{ 'sessions.fieldTitle' | transloco }}</label>
                <input
                  hlmInput
                  id="title"
                  formControlName="title"
                  [placeholder]="'sessions.titlePlaceholder' | transloco"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="language">{{ 'sessions.fieldLanguage' | transloco }}</label>
                <input hlmInput id="language" formControlName="language" placeholder="es-PE" />
              </div>
              <button hlmBtn type="submit" [disabled]="form.invalid || loading()">
                @if (loading()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'common.create' | transloco }}
              </button>
            </form>
            @if (errorMessage()) {
              <p class="mt-2 text-sm text-destructive" data-testid="form-error">
                {{ errorMessage() }}
              </p>
            }
          </div>
        </div>
      }

      @switch (store.sessionsState()) {
        @case ('loading') {
          <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ 'sessions.loadError' | transloco }}</p>
        }
        @default {
          @if (store.sessions().length === 0 && !showForm()) {
            <div
              hlmCard
              class="flex flex-col items-center gap-3 py-16 text-center"
              data-testid="sessions-empty"
            >
              <span class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <hlm-icon name="lucideMic" size="22px" />
              </span>
              <div>
                <p class="font-medium">{{ 'sessions.emptyTitle' | transloco }}</p>
                <p class="text-sm text-muted-foreground">{{ 'sessions.emptyBody' | transloco }}</p>
              </div>
              <button hlmBtn size="sm" type="button" (click)="showForm.set(true)">
                {{ 'sessions.createCta' | transloco }}
              </button>
            </div>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (session of store.sessions(); track session.id) {
                <li>
                  <a
                    hlmCard
                    [routerLink]="[session.id]"
                    class="group flex items-center gap-4 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    data-testid="session-row"
                  >
                    <span
                      class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                    >
                      <hlm-icon name="lucideMic" size="18px" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ session.title }}</span>
                      <span
                        class="block truncate text-sm text-muted-foreground"
                        [title]="session.createdAt | date: 'medium'"
                      >
                        {{ session.language }} · {{ 'sessions.createdRelative' | transloco }}
                        {{ session.createdAt | fromNow }}
                      </span>
                    </span>
                    <span hlmBadge [variant]="statusVariant(session.status)">
                      {{ 'sessions.status.' + session.status | transloco }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
})
export class Sessions {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly store = inject(DiscoveryStore);

  readonly projectId = input.required<string>();
  protected readonly statusVariant = statusVariant;

  protected readonly showForm = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    language: ['es-PE', [Validators.required, Validators.maxLength(8)]],
  });

  constructor() {
    effect(() => this.store.loadSessions(this.projectId()));
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.store.createSession(this.projectId(), this.form.getRawValue()).subscribe({
      next: (session) =>
        void this.router.navigate(['/projects', this.projectId(), 'sessions', session.id]),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 400 ? 'sessions.errorValidation' : 'sessions.errorCreate',
          ),
        );
      },
    });
  }
}
