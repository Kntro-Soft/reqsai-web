import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  SuggestionPriority,
  SuggestionResponse,
} from '../../data/discovery.models';
import { provideIcons } from '@ng-icons/core';
import { lucideSparkles } from '@ng-icons/lucide';
import { HlmButton, HlmIcon, HlmInput } from '../../../../shared/ui';

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** One AI suggestion the analyst can edit, accept or dismiss, rendered per type. */
@Component({
  selector: 'app-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormsModule, HlmButton, HlmInput, HlmIcon],
  viewProviders: [provideIcons({ lucideSparkles })],
  template: `
    <div class="rounded-2xl border border-primary/30 bg-card/60 p-4" data-testid="suggestion-card">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          <hlm-icon name="lucideSparkles" size="12px" />
          {{ typeLabel() }}
        </span>
        @if (suggestion().type !== 'CLARIFYING_QUESTION') {
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
            [class]="priorityClass(ePriority())"
          >
            {{ priorityLabel(ePriority()) }}
          </span>
        }
      </div>

      @switch (suggestion().type) {
        @case ('CLARIFYING_QUESTION') {
          <p class="text-sm leading-relaxed">{{ suggestion().question }}</p>
        }
        @case ('UPDATE_STORY') {
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl border border-border bg-background/40 p-3">
              <p class="mb-1 text-[11px] font-medium uppercase text-muted-foreground">Actual</p>
              @if (targetStory(); as cur) {
                <p class="text-sm font-medium">{{ cur.title }}</p>
                <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Como {{ cur.role }}, quiero {{ cur.action }}, para {{ cur.benefit }}.
                </p>
              } @else {
                <p class="text-xs text-muted-foreground">Historia no encontrada.</p>
              }
            </div>
            <div class="rounded-xl border border-primary/40 p-3">
              <p class="mb-1 text-[11px] font-medium uppercase text-primary">Propuesta</p>
              <ng-container [ngTemplateOutlet]="storyBody" />
            </div>
          </div>
        }
        @default {
          <ng-container [ngTemplateOutlet]="storyBody" />
        }
      }

      <div class="mt-3 flex flex-wrap gap-2">
        <button hlmBtn size="sm" type="button" (click)="onAccept()" data-testid="suggestion-accept">
          Aceptar
        </button>
        @if (suggestion().type !== 'CLARIFYING_QUESTION') {
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            (click)="editing.set(!editing())"
          >
            {{ editing() ? 'Listo' : 'Editar' }}
          </button>
        }
        <button
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          (click)="dismiss.emit()"
          data-testid="suggestion-dismiss"
        >
          Rechazar
        </button>
      </div>
    </div>

    <ng-template #storyBody>
      @if (editing()) {
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{{
              suggestion().type === 'EDGE_CASE' ? 'Escenario' : 'Título'
            }}</span>
            <input hlmInput class="h-9" [ngModel]="eTitle()" (ngModelChange)="eTitle.set($event)" />
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <input
              hlmInput
              class="h-9"
              placeholder="Rol"
              [ngModel]="eRole()"
              (ngModelChange)="eRole.set($event)"
            />
            <input
              hlmInput
              class="h-9"
              placeholder="Acción"
              [ngModel]="eAction()"
              (ngModelChange)="eAction.set($event)"
            />
            <input
              hlmInput
              class="h-9"
              placeholder="Beneficio"
              [ngModel]="eBenefit()"
              (ngModelChange)="eBenefit.set($event)"
            />
          </div>
          @if (suggestion().type !== 'EDGE_CASE') {
            <div class="flex items-end gap-2">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Prioridad</span>
                <select
                  class="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  [ngModel]="ePriority()"
                  (ngModelChange)="ePriority.set($event)"
                >
                  @for (p of priorities; track p) {
                    <option [value]="p">{{ priorityLabel(p) }}</option>
                  }
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Puntos</span>
                <input
                  hlmInput
                  class="h-9 w-20"
                  type="number"
                  [ngModel]="ePoints()"
                  (ngModelChange)="ePoints.set($event)"
                />
              </div>
            </div>
          }
        </div>
      } @else if (suggestion().type === 'EDGE_CASE') {
        <div class="text-sm leading-relaxed">
          <p class="font-medium">{{ eTitle() }}</p>
          <p class="mt-1 text-muted-foreground">
            <span class="text-foreground">Dado</span> que el usuario es
            {{ eRole() || 'el usuario' }}, <span class="text-foreground">cuando</span>
            {{ eAction() }}, <span class="text-foreground">entonces</span> {{ eBenefit() }}.
          </p>
        </div>
      } @else {
        <p class="text-sm font-medium">{{ eTitle() }}</p>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
          Como <span class="text-foreground">{{ eRole() }}</span
          >, quiero <span class="text-foreground">{{ eAction() }}</span
          >, para <span class="text-foreground">{{ eBenefit() }}</span
          >.
        </p>
      }
    </ng-template>
  `,
})
export class SuggestionCard {
  readonly suggestion = input.required<SuggestionResponse>();
  readonly targetStory = input<DisplayStory | undefined>(undefined);
  readonly accept = output<AcceptSuggestionRequest>();
  readonly dismiss = output<void>();

  protected readonly editing = signal(false);
  protected readonly priorities = PRIORITIES;

  protected readonly eTitle = linkedSignal(() => this.suggestion().draftTitle ?? '');
  protected readonly eRole = linkedSignal(() => this.suggestion().draftRole ?? '');
  protected readonly eAction = linkedSignal(() => this.suggestion().draftAction ?? '');
  protected readonly eBenefit = linkedSignal(() => this.suggestion().draftBenefit ?? '');
  protected readonly ePriority = linkedSignal<SuggestionPriority>(
    () => this.suggestion().draftPriority ?? 'MEDIUM',
  );
  protected readonly ePoints = linkedSignal<number | null>(
    () => this.suggestion().draftStoryPoints,
  );

  protected readonly typeLabel = computed(() => {
    const labels: Record<string, string> = {
      NEW_STORY: 'Nueva historia',
      UPDATE_STORY: 'Actualizar historia',
      EDGE_CASE: 'Caso borde',
      CLARIFYING_QUESTION: 'Pregunta',
    };
    return labels[this.suggestion().type] ?? this.suggestion().type;
  });

  protected onAccept(): void {
    if (!this.editing()) {
      this.accept.emit({});
      return;
    }
    this.accept.emit({
      editedTitle: this.eTitle() || undefined,
      editedRole: this.eRole() || undefined,
      editedAction: this.eAction() || undefined,
      editedBenefit: this.eBenefit() || undefined,
      editedPriority: this.ePriority(),
      editedStoryPoints: this.ePoints() ?? undefined,
    });
  }

  protected priorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      LOW: 'Baja',
      MEDIUM: 'Media',
      HIGH: 'Alta',
      CRITICAL: 'Crítica',
    };
    return labels[priority] ?? priority;
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      CRITICAL: 'bg-destructive/20 text-destructive',
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority] ?? 'bg-secondary text-muted-foreground';
  }
}
