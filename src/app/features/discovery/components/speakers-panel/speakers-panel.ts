import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideTriangleAlert } from '@ng-icons/lucide';
import { SessionSpeakersStore } from '../../data/session-speakers.store';
import { SpeakerOverlapsResponse, SpeakerSide } from '../../data/discovery.models';
import {
  SPEAKER_NAME_MAX,
  SpeakerColor,
  SpeakerView,
  normalizeSpeakerName,
  overlapNotice,
  speakerColor,
} from '../../data/speakers';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';

/** What the analyst is typing for one speaker before saving. */
interface SpeakerDraft {
  name: string;
  side: SpeakerSide | null;
}

/**
 * The speakers of one session (US40): each diarized voice with its color, an editable real name and
 * a Cliente / Equipo toggle. Saving applies to all of that speaker's segments, past and future, and
 * to what the AI reads from then on: it builds the requirements from what the client says. Warns
 * when the speakers talked over each other, since the attribution may be wrong there. Read-only for
 * users who cannot run sessions.
 */
@Component({
  selector: 'app-speakers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, HlmButton, HlmIcon, HlmInput, HlmSpinner],
  viewProviders: [provideIcons({ lucideCheck, lucideTriangleAlert })],
  template: `
    <div class="flex flex-col gap-3" data-testid="speakers-panel">
      <p class="text-sm text-muted-foreground">
        {{ 'discovery.speakers.description' | transloco }}
      </p>

      @if (notice(); as n) {
        <p
          class="flex items-start gap-2 rounded-lg border border-pending-border bg-pending-soft px-3 py-2 text-xs text-pending"
          role="status"
          data-testid="speakers-panel-overlap"
        >
          <hlm-icon name="lucideTriangleAlert" size="14px" class="mt-px shrink-0" />
          {{ n.key | transloco: n.params }}
        </p>
      }

      @if (speakers().length === 0) {
        <p class="text-sm" data-testid="speakers-empty">
          {{ 'discovery.speakers.empty' | transloco }}
        </p>
      }

      <ul class="flex flex-col gap-2">
        @for (speaker of speakers(); track speaker.label) {
          @let draft = draftFor(speaker);
          @let color = colorOf(speaker);
          <li
            class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
            data-testid="speaker-row"
            [attr.data-speaker-label]="speaker.label"
          >
            <div class="flex items-center gap-2">
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                [class]="color.dot"
                aria-hidden="true"
              ></span>
              <input
                hlmInput
                class="h-9 min-w-0 flex-1"
                [value]="draft.name"
                [placeholder]="defaultName(speaker)"
                [attr.maxlength]="nameMax"
                [disabled]="!canEdit() || isSaving(speaker)"
                (input)="setName(speaker, $any($event.target).value)"
                (keydown.enter)="save(speaker)"
                [attr.aria-label]="
                  'discovery.speakers.nameLabel' | transloco: { name: defaultName(speaker) }
                "
                data-testid="speaker-name-input"
              />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div
                class="inline-flex rounded-lg border border-border p-0.5"
                role="group"
                [attr.aria-label]="'discovery.speakers.sideLabel' | transloco"
              >
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                  [class]="sideClass(draft.side === 'CLIENT')"
                  [attr.aria-pressed]="draft.side === 'CLIENT'"
                  [disabled]="!canEdit() || isSaving(speaker)"
                  (click)="toggleSide(speaker, 'CLIENT')"
                  data-testid="speaker-side-client"
                >
                  {{ 'discovery.speakers.side.CLIENT' | transloco }}
                </button>
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                  [class]="sideClass(draft.side === 'TEAM')"
                  [attr.aria-pressed]="draft.side === 'TEAM'"
                  [disabled]="!canEdit() || isSaving(speaker)"
                  (click)="toggleSide(speaker, 'TEAM')"
                  data-testid="speaker-side-team"
                >
                  {{ 'discovery.speakers.side.TEAM' | transloco }}
                </button>
              </div>
              @if (speaker.segmentCount > 0) {
                <span class="text-xs text-muted-foreground">
                  {{ 'discovery.speakers.segments' | transloco: { count: speaker.segmentCount } }}
                </span>
              }
              @if (canEdit()) {
                <button
                  hlmBtn
                  size="sm"
                  type="button"
                  class="ml-auto"
                  [disabled]="!isDirty(speaker) || isSaving(speaker)"
                  (click)="save(speaker)"
                  data-testid="speaker-save"
                >
                  @if (isSaving(speaker)) {
                    <hlm-spinner class="h-4 w-4" />
                  } @else {
                    <hlm-icon name="lucideCheck" size="14px" />
                  }
                  {{ 'discovery.speakers.save' | transloco }}
                </button>
              }
            </div>
          </li>
        }
      </ul>
    </div>
  `,
})
export class SpeakersPanel {
  private readonly store = inject(SessionSpeakersStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();
  /** The session's speakers in order of first appearance. */
  readonly speakers = input.required<SpeakerView[]>();
  readonly overlaps = input<SpeakerOverlapsResponse | null>(null);
  /** Renaming needs the session-run permission; without it the panel is read-only. */
  readonly canEdit = input(false);

  protected readonly nameMax = SPEAKER_NAME_MAX;
  protected readonly notice = computed(() => overlapNotice(this.overlaps()));

  /** Unsaved edits by speaker label; a speaker without an entry shows its saved values. */
  private readonly drafts = signal<Record<string, SpeakerDraft>>({});
  private readonly saving = signal<readonly string[]>([]);

  protected draftFor(speaker: SpeakerView): SpeakerDraft {
    return this.drafts()[speaker.label] ?? this.saved(speaker);
  }

  protected colorOf(speaker: SpeakerView): SpeakerColor {
    return speakerColor(speaker.index);
  }

  protected defaultName(speaker: SpeakerView): string {
    return this.transloco.translate('discovery.speaker', { n: speaker.index });
  }

  protected isSaving(speaker: SpeakerView): boolean {
    return this.saving().includes(speaker.label);
  }

  protected isDirty(speaker: SpeakerView): boolean {
    const draft = this.drafts()[speaker.label];
    if (!draft) return false;
    const saved = this.saved(speaker);
    return (
      normalizeSpeakerName(draft.name) !== normalizeSpeakerName(saved.name) ||
      draft.side !== saved.side
    );
  }

  protected sideClass(active: boolean): string {
    return active
      ? 'bg-foreground text-background'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground';
  }

  protected setName(speaker: SpeakerView, name: string): void {
    this.edit(speaker, { name });
  }

  /** Picks a side; picking the current one again clears it. */
  protected toggleSide(speaker: SpeakerView, side: SpeakerSide): void {
    const current = this.draftFor(speaker).side;
    this.edit(speaker, { side: current === side ? null : side });
  }

  protected save(speaker: SpeakerView): void {
    if (!this.canEdit() || !this.isDirty(speaker) || this.isSaving(speaker)) return;
    const draft = this.draftFor(speaker);
    const label = speaker.label;
    this.saving.update((labels) => [...labels, label]);
    this.store
      .update(this.projectId(), this.sessionId(), label, {
        displayName: normalizeSpeakerName(draft.name),
        side: draft.side,
      })
      .subscribe({
        next: (saved) => {
          this.saving.update((labels) => labels.filter((l) => l !== label));
          this.drafts.update((all) => {
            const next = { ...all };
            delete next[label];
            return next;
          });
          this.toast.success(
            this.transloco.translate('discovery.speakers.saved', {
              name: saved.displayName ?? this.defaultName(speaker),
            }),
          );
        },
        error: (err: unknown) => {
          this.saving.update((labels) => labels.filter((l) => l !== label));
          this.toast.error(messageForError(err, this.transloco));
        },
      });
  }

  private saved(speaker: SpeakerView): SpeakerDraft {
    return { name: speaker.displayName ?? '', side: speaker.role };
  }

  private edit(speaker: SpeakerView, change: Partial<SpeakerDraft>): void {
    if (!this.canEdit()) return;
    this.drafts.update((all) => ({
      ...all,
      [speaker.label]: { ...this.draftFor(speaker), ...change },
    }));
  }
}
