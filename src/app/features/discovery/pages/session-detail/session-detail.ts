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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { DiscoveryStore } from '../../data/discovery.store';
import { SessionRealtimeMessage } from '../../data/discovery.models';
import { EVENT_LABEL, statusLabel, statusVariant } from '../../data/session-ui';
import {
  HlmBadge,
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
  HlmSpinner,
} from '../../../../shared/ui';

type Action = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

@Component({
  selector: 'app-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge, HlmButton, HlmCard, HlmCardHeader, HlmCardTitle, HlmCardContent, HlmSpinner],
  template: `
    <div class="flex flex-col gap-6">
      @if (store.current(); as session) {
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">{{ session.title }}</h1>
            <p class="text-sm text-muted-foreground">{{ session.language }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="inline-flex items-center gap-1.5 text-xs"
              [class.text-emerald-600]="realtime.connected()"
              [class.text-muted-foreground]="!realtime.connected()"
              data-testid="live-indicator"
            >
              <span
                class="h-2 w-2 rounded-full"
                [class.bg-emerald-500]="realtime.connected()"
                [class.bg-muted-foreground]="!realtime.connected()"
              ></span>
              {{ realtime.connected() ? 'En vivo' : 'Conectando…' }}
            </span>
            <span hlmBadge [variant]="variant()" data-testid="session-status">{{
              statusLabel(session.status)
            }}</span>
          </div>
        </div>

        <!-- Lifecycle controls -->
        <div class="flex flex-wrap gap-2">
          @switch (session.status) {
            @case ('DRAFT') {
              <button hlmBtn type="button" [disabled]="busy()" (click)="run('start')">
                Iniciar grabación
              </button>
            }
            @case ('RECORDING') {
              <button
                hlmBtn
                variant="secondary"
                type="button"
                [disabled]="busy()"
                (click)="run('pause')"
              >
                Pausar
              </button>
              <button
                hlmBtn
                variant="destructive"
                type="button"
                [disabled]="busy()"
                (click)="run('stop')"
              >
                Detener
              </button>
            }
            @case ('PAUSED') {
              <button hlmBtn type="button" [disabled]="busy()" (click)="run('resume')">
                Reanudar
              </button>
              <button
                hlmBtn
                variant="destructive"
                type="button"
                [disabled]="busy()"
                (click)="run('stop')"
              >
                Detener
              </button>
            }
            @case ('PROCESSING') {
              <span class="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <hlm-spinner class="h-4 w-4" /> Procesando…
              </span>
            }
            @default {
              <button
                hlmBtn
                variant="outline"
                type="button"
                [disabled]="busy()"
                (click)="run('reset')"
              >
                Reiniciar
              </button>
            }
          }
        </div>

        @if (session.processingError) {
          <p class="text-sm text-destructive">{{ session.processingError }}</p>
        }

        <div class="grid gap-6 lg:grid-cols-3">
          <!-- Live event feed -->
          <div hlmCard class="lg:col-span-1">
            <div hlmCardHeader><h2 hlmCardTitle>Actividad en vivo</h2></div>
            <div hlmCardContent>
              @if (store.events().length === 0) {
                <p class="text-sm text-muted-foreground">Esperando eventos…</p>
              } @else {
                <ul class="flex flex-col gap-2 text-sm">
                  @for (event of store.events(); track $index) {
                    <li class="flex items-center gap-2" data-testid="live-event">
                      <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                      {{ label(event.type) }}
                    </li>
                  }
                </ul>
              }
            </div>
          </div>

          <!-- Live transcript -->
          <div hlmCard class="lg:col-span-2">
            <div hlmCardHeader><h2 hlmCardTitle>Transcripción</h2></div>
            <div hlmCardContent>
              @if (store.transcript().length === 0) {
                <p class="text-sm text-muted-foreground">
                  La transcripción en vivo aparecerá aquí durante la grabación.
                </p>
              } @else {
                <div class="flex flex-col gap-1 text-sm">
                  @for (segment of store.transcript(); track segment.sequence) {
                    <p [class.opacity-60]="!segment.isFinal">
                      @if (segment.speakerLabel) {
                        <span class="font-medium">{{ segment.speakerLabel }}:</span>
                      }
                      {{ segment.text }}
                    </p>
                  }
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Generated stories -->
        <div hlmCard>
          <div hlmCardHeader><h2 hlmCardTitle>Historias generadas</h2></div>
          <div hlmCardContent>
            @if (store.stories().length === 0) {
              <p class="text-sm text-muted-foreground">
                Las historias sugeridas por la IA aparecerán aquí.
              </p>
            } @else {
              <ul class="grid gap-3 sm:grid-cols-2">
                @for (story of store.stories(); track story.storyId) {
                  <li hlmCard class="p-4" data-testid="story-row">
                    <p class="font-medium">{{ story.title }}</p>
                    <p class="text-sm text-muted-foreground">
                      Como {{ story.role }}, quiero {{ story.action }}, para {{ story.benefit }}.
                    </p>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      } @else {
        <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
      }
    </div>
  `,
})
export class SessionDetail implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly realtime = inject(RealtimeService);
  protected readonly store = inject(DiscoveryStore);

  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();

  protected readonly busy = signal(false);
  protected readonly statusLabel = statusLabel;
  protected readonly variant = computed(() => {
    const status = this.store.current()?.status;
    return status ? statusVariant(status) : 'secondary';
  });

  ngOnInit(): void {
    this.store.loadSession(this.projectId(), this.sessionId());
    this.store.resetLive();
    // Subscribe to the session topic; every update feeds the live signals.
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
}
