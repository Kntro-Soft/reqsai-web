import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { DiscoveryStore } from '../../data/discovery.store';
import { SessionRealtimeMessage } from '../../data/discovery.models';
import { EVENT_LABEL, statusLabel, statusVariant } from '../../data/session-ui';
import { HlmBadge, HlmButton, HlmSpinner } from '../../../../shared/ui';

type Action = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

/**
 * The session "chat": a recording composer up top, a live transcript stream
 * (Persona 1/2), and the AI's user-story suggestions as they are generated.
 */
@Component({
  selector: 'app-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmBadge, HlmButton, HlmSpinner],
  template: `
    @if (store.current(); as session) {
      <div class="flex flex-col gap-5">
        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-bold tracking-tight">{{ session.title }}</h1>
            <div class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{{ session.language }}</span>
              <span class="h-1 w-1 rounded-full bg-border"></span>
              <span
                class="inline-flex items-center gap-1.5"
                [class.text-emerald-500]="realtime.connected()"
                data-testid="live-indicator"
              >
                <span
                  class="h-2 w-2 rounded-full"
                  [class.bg-emerald-500]="realtime.connected()"
                  [class.bg-muted-foreground]="!realtime.connected()"
                ></span>
                {{ realtime.connected() ? 'En vivo' : 'Conectando…' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span hlmBadge [variant]="variant()" data-testid="session-status">
              {{ statusLabel(session.status) }}
            </span>
            <a
              [routerLink]="['/projects', projectId(), 'sessions']"
              title="Historial de sesiones"
              aria-label="Historial de sesiones"
              class="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2" />
              </svg>
            </a>
          </div>
        </div>

        <!-- Recording composer -->
        <div
          class="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/60 p-3"
        >
          @switch (session.status) {
            @case ('DRAFT') {
              <button hlmBtn type="button" [disabled]="busy()" (click)="run('start')">
                <span class="mr-1.5 h-2 w-2 rounded-full bg-current"></span>Iniciar grabación
              </button>
            }
            @case ('RECORDING') {
              <button hlmBtn variant="secondary" [disabled]="busy()" (click)="run('pause')">
                Pausar
              </button>
              <button hlmBtn variant="destructive" [disabled]="busy()" (click)="run('stop')">
                Detener
              </button>
            }
            @case ('PAUSED') {
              <button hlmBtn [disabled]="busy()" (click)="run('resume')">Reanudar</button>
              <button hlmBtn variant="destructive" [disabled]="busy()" (click)="run('stop')">
                Detener
              </button>
            }
            @case ('STOPPED') {
              <button hlmBtn [disabled]="busy()" (click)="process()" data-testid="process-btn">
                @if (busy()) {
                  <hlm-spinner class="mr-1.5 h-4 w-4" />
                }
                Generar historias
              </button>
              <button hlmBtn variant="outline" [disabled]="busy()" (click)="run('reset')">
                Reiniciar
              </button>
            }
            @case ('PROCESSING') {
              <span class="inline-flex items-center gap-2 px-2 text-sm text-muted-foreground">
                <hlm-spinner class="h-4 w-4" /> Generando historias…
              </span>
            }
            @default {
              <button hlmBtn variant="outline" [disabled]="busy()" (click)="run('reset')">
                Nueva grabación
              </button>
            }
          }

          <span class="mx-1 hidden h-6 w-px bg-border sm:block"></span>

          <button
            hlmBtn
            variant="outline"
            type="button"
            [disabled]="uploading()"
            (click)="picker.click()"
            data-testid="upload-btn"
          >
            @if (uploading()) {
              <hlm-spinner class="mr-1.5 h-4 w-4" />
            }
            Subir audio
          </button>
          <input
            #picker
            type="file"
            accept="audio/*"
            class="hidden"
            (change)="upload($event)"
          />

          @if (session.processingError) {
            <span class="text-sm text-destructive">{{ session.processingError }}</span>
          }
        </div>

        <div class="grid gap-5 lg:grid-cols-5">
          <!-- Transcript chat -->
          <div class="lg:col-span-3">
            <h2 class="mb-3 text-sm font-medium text-muted-foreground">Transcripción</h2>
            @if (lifecycleEvents().length) {
              <div class="mb-3 flex flex-col items-center gap-1">
                @for (event of lifecycleEvents(); track $index) {
                  <span
                    class="rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs text-muted-foreground"
                    data-testid="live-event"
                  >
                    {{ label(event.type) }}
                  </span>
                }
              </div>
            }
            @if (store.transcript().length === 0) {
              <div class="rounded-2xl border border-dashed border-border p-10 text-center">
                <p class="text-sm text-muted-foreground">
                  La conversación aparecerá aquí mientras grabas o tras subir un audio.
                </p>
              </div>
            } @else {
              <div class="flex flex-col gap-3">
                @for (segment of store.transcript(); track segment.sequence) {
                  <div class="flex gap-2.5" [class.opacity-60]="!segment.isFinal">
                    <span
                      class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground"
                    >
                      {{ personaInitials(segment.speakerLabel) }}
                    </span>
                    <div class="min-w-0">
                      <p class="text-xs text-muted-foreground">
                        {{ personaLabel(segment.speakerLabel) }}
                      </p>
                      <p class="text-sm leading-relaxed">{{ segment.text }}</p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- AI story suggestions -->
          <div class="lg:col-span-2">
            <h2 class="mb-3 text-sm font-medium text-muted-foreground">
              Sugerencias de la IA
              @if (store.stories().length) {
                <span class="text-primary">({{ store.stories().length }})</span>
              }
            </h2>
            @if (store.stories().length === 0) {
              <div class="rounded-2xl border border-dashed border-border p-10 text-center">
                <p class="text-sm text-muted-foreground">
                  Las historias sugeridas aparecerán aquí al generar.
                </p>
              </div>
            } @else {
              <div class="flex flex-col gap-3">
                @for (story of store.stories(); track story.id) {
                  <div
                    class="rounded-2xl border border-border bg-card p-4"
                    data-testid="story-row"
                  >
                    <div class="mb-1.5 flex items-center gap-2">
                      <span
                        class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        Sugerencia IA
                      </span>
                      <span
                        class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        [class]="priorityClass(story.priority)"
                      >
                        {{ priorityLabel(story.priority) }}
                      </span>
                      @if (story.storyPoints !== null) {
                        <span class="ml-auto text-[11px] text-muted-foreground"
                          >{{ story.storyPoints }} pts</span
                        >
                      }
                    </div>
                    <p class="text-sm font-medium">{{ story.title }}</p>
                    <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Como <span class="text-foreground">{{ story.role }}</span
                      >, quiero <span class="text-foreground">{{ story.action }}</span
                      >, para <span class="text-foreground">{{ story.benefit }}</span
                      >.
                    </p>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="flex justify-center py-16"><hlm-spinner class="h-6 w-6" /></div>
    }
  `,
})
export class SessionDetail implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly realtime = inject(RealtimeService);
  protected readonly store = inject(DiscoveryStore);

  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();

  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly statusLabel = statusLabel;
  protected readonly variant = computed(() => {
    const status = this.store.current()?.status;
    return status ? statusVariant(status) : 'secondary';
  });
  // System markers (lifecycle), excluding the noisy per-segment / per-story events.
  protected readonly lifecycleEvents = computed(() =>
    this.store
      .events()
      .filter((e) => e.type !== 'TRANSCRIPT_SEGMENT' && e.type !== 'STORY_GENERATED'),
  );

  ngOnInit(): void {
    this.store.resetLive();
    this.store.loadSession(this.projectId(), this.sessionId());
    this.realtime
      .watch<SessionRealtimeMessage>(`sessions/${this.sessionId()}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.store.applyRealtime(message));
  }

  protected label(type: SessionRealtimeMessage['type']): string {
    return EVENT_LABEL[type];
  }

  protected run(action: Action): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.store.transition(this.projectId(), this.sessionId(), action).subscribe({
      next: () => this.busy.set(false),
      error: () => this.busy.set(false),
    });
  }

  protected process(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.store.process(this.sessionId()).subscribe({
      next: () => this.busy.set(false),
      error: () => this.busy.set(false),
    });
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.uploading()) return;
    this.uploading.set(true);
    this.store.uploadAudio(this.sessionId(), file).subscribe({
      next: () => {
        this.uploading.set(false);
        input.value = '';
      },
      error: () => this.uploading.set(false),
    });
  }

  protected personaLabel(speakerLabel: string | null): string {
    if (speakerLabel == null || speakerLabel === '') return 'Participante';
    const n = Number(speakerLabel);
    return Number.isFinite(n) ? `Persona ${n + 1}` : speakerLabel;
  }

  protected personaInitials(speakerLabel: string | null): string {
    if (speakerLabel == null || speakerLabel === '') return 'P';
    const n = Number(speakerLabel);
    return Number.isFinite(n) ? `P${n + 1}` : speakerLabel.slice(0, 2).toUpperCase();
  }

  protected priorityLabel(priority: string): string {
    const labels: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };
    return labels[priority] ?? priority;
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority] ?? 'bg-secondary text-muted-foreground';
  }
}
