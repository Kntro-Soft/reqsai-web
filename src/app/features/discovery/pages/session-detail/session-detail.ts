import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { DiscoveryStore } from '../../data/discovery.store';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  SessionRealtimeMessage,
  SuggestionResponse,
} from '../../data/discovery.models';
import { EVENT_LABEL, statusLabel } from '../../data/session-ui';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideSparkles, lucideUpload } from '@ng-icons/lucide';
import { SuggestionCard } from '../../components/suggestion-card/suggestion-card';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

type Action = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

/**
 * The session "chat": a live transcript stream (Persona 1/2) with the AI's
 * user-story suggestions inline, and a recording composer pinned at the bottom.
 */
@Component({
  selector: 'app-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmSpinner, SuggestionCard, HlmIcon],
  viewProviders: [provideIcons({ lucideSparkles, lucideCheck, lucideUpload })],
  template: `
    @if (store.current(); as session) {
      <div class="flex flex-col gap-4">
        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="truncate text-xl font-bold tracking-tight">{{ session.title }}</h1>
            <div class="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
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
          <span
            class="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
            [class]="statusPill(session.status)"
            data-testid="session-status"
          >
            @if (session.status === 'RECORDING') {
              <span class="h-2 w-2 rounded-full bg-current"></span>
            }
            {{ statusLabel(session.status) }}
          </span>
        </div>

        <!-- Chat: transcript + inline AI suggestions -->
        <div class="flex flex-col gap-4 pb-4">
          @if (lifecycleEvents().length) {
            <div class="flex flex-col items-center gap-1">
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

          @for (segment of store.transcript(); track segment.sequence) {
            <div class="flex gap-3" [class.opacity-60]="!segment.isFinal">
              <span
                class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground"
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

          @if (store.suggestions().length) {
            <div class="flex flex-col gap-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sugerencias de la IA · {{ store.suggestions().length }}
              </p>
              @for (sg of store.suggestions(); track sg.id) {
                <app-suggestion-card
                  [suggestion]="sg"
                  [targetStory]="targetStory(sg)"
                  (accept)="acceptSuggestion(sg, $event)"
                  (dismiss)="dismissSuggestion(sg)"
                />
              }
            </div>
          }

          @for (story of store.stories(); track story.id) {
            <div class="rounded-2xl border border-border bg-card/60 p-4" data-testid="story-row">
              <div class="mb-1.5 flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  <hlm-icon name="lucideSparkles" size="12px" />
                  Historia generada
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
              @if (approved().has(story.id)) {
                <p
                  class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500"
                >
                  <hlm-icon name="lucideCheck" size="14px" />
                  Aprobada
                </p>
              } @else {
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    hlmBtn
                    size="sm"
                    variant="outline"
                    type="button"
                    (click)="approve(story.id)"
                  >
                    Aprobar
                  </button>
                  <button hlmBtn size="sm" variant="outline" type="button" disabled>Editar</button>
                  <button hlmBtn size="sm" variant="outline" type="button" disabled>
                    Duplicar
                  </button>
                </div>
              }
            </div>
          }

          @if (
            store.transcript().length === 0 &&
            store.stories().length === 0 &&
            store.suggestions().length === 0
          ) {
            <div class="rounded-2xl border border-dashed border-border p-12 text-center">
              <p class="text-sm text-muted-foreground">
                Inicia la grabación o sube un audio para empezar a capturar la conversación.
              </p>
            </div>
          }
        </div>
      </div>

      <!-- Composer (pinned) -->
      <div
        class="sticky bottom-0 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6"
      >
        <div class="mx-auto flex max-w-5xl items-center gap-3">
          @switch (session.status) {
            @case ('DRAFT') {
              <button
                hlmBtn
                type="button"
                [disabled]="busy()"
                (click)="run('start')"
                aria-label="Iniciar grabación"
                class="h-12 w-12 rounded-full p-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v4"
                  />
                </svg>
              </button>
            }
            @case ('RECORDING') {
              <button
                hlmBtn
                variant="destructive"
                type="button"
                [disabled]="busy()"
                (click)="run('stop')"
                aria-label="Detener"
                class="h-12 w-12 rounded-full p-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
              <button
                hlmBtn
                variant="secondary"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="run('pause')"
              >
                Pausar
              </button>
            }
            @case ('PAUSED') {
              <button
                hlmBtn
                type="button"
                [disabled]="busy()"
                (click)="run('resume')"
                aria-label="Reanudar"
                class="h-12 w-12 rounded-full p-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <button
                hlmBtn
                variant="destructive"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="run('stop')"
              >
                Detener
              </button>
            }
            @case ('STOPPED') {
              <button
                hlmBtn
                type="button"
                [disabled]="busy()"
                (click)="process()"
                data-testid="process-btn"
              >
                @if (busy()) {
                  <hlm-spinner class="mr-1.5 h-4 w-4" />
                }
                Generar historias
              </button>
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="run('reset')"
              >
                Reiniciar
              </button>
            }
            @case ('PROCESSING') {
              <span class="inline-flex items-center gap-2 text-sm text-muted-foreground"
                ><hlm-spinner class="h-4 w-4" /> Generando historias…</span
              >
            }
            @default {
              <button
                hlmBtn
                variant="outline"
                type="button"
                [disabled]="busy()"
                (click)="run('reset')"
              >
                Nueva grabación
              </button>
            }
          }

          <div class="flex flex-1 items-center justify-center gap-1" aria-hidden="true">
            @for (bar of waveform; track $index) {
              <span
                class="w-[3px] rounded-full transition-all"
                [class.bg-primary]="recording()"
                [class.bg-border]="!recording()"
                [style.height.px]="recording() ? bar : 6"
              ></span>
            }
          </div>

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
            <hlm-icon name="lucideUpload" size="15px" class="mr-1.5" />
            Subir audio
          </button>
          <input #picker type="file" accept="audio/*" class="hidden" (change)="upload($event)" />
        </div>
        @if (session.processingError || audioRecorder.error()) {
          <p class="mx-auto mt-2 max-w-5xl text-sm text-destructive">
            {{ session.processingError || audioRecorder.error() }}
          </p>
        }
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
  protected readonly audioRecorder = inject(AudioRecorderService);

  constructor() {
    effect(() => {
      const isRecording = this.recording();
      const sessionId = this.sessionId();

      if (isRecording) {
        void this.audioRecorder.startStreaming(sessionId);
      } else {
        this.audioRecorder.stopStreaming();
      }
    });
  }

  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();

  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly approved = signal<Set<string>>(new Set());
  protected readonly statusLabel = statusLabel;
  protected readonly waveform = [10, 18, 24, 14, 20, 9, 16, 22, 12, 19, 8, 15];
  protected readonly recording = computed(() => this.store.current()?.status === 'RECORDING');
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

    this.destroyRef.onDestroy(() => {
      this.audioRecorder.stopStreaming();
    });
  }

  protected label(type: SessionRealtimeMessage['type']): string {
    return EVENT_LABEL[type];
  }

  protected acceptSuggestion(s: SuggestionResponse, body: AcceptSuggestionRequest): void {
    this.store.acceptSuggestion(this.sessionId(), s.id, body).subscribe();
  }

  protected dismissSuggestion(s: SuggestionResponse): void {
    this.store.dismissSuggestion(this.sessionId(), s.id).subscribe();
  }

  protected targetStory(s: SuggestionResponse): DisplayStory | undefined {
    return s.targetStoryId ? this.store.findStory(s.targetStoryId) : undefined;
  }

  protected approve(id: string): void {
    this.approved.update((set) => new Set(set).add(id));
  }

  protected async run(action: Action): Promise<void> {
    if (this.busy()) return;

    if (action === 'start' || action === 'resume') {
      const hasPermission = await this.audioRecorder.requestPermission();
      if (!hasPermission) {
        return;
      }
    }

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

  protected statusPill(status: string): string {
    const classes: Record<string, string> = {
      RECORDING: 'bg-emerald-500/15 text-emerald-500',
      PAUSED: 'bg-amber-500/15 text-amber-600',
      PROCESSING: 'bg-primary/15 text-primary',
      COMPLETED: 'bg-emerald-500/15 text-emerald-500',
      FAILED: 'bg-destructive/15 text-destructive',
    };
    return classes[status] ?? 'bg-secondary text-muted-foreground';
  }
}
