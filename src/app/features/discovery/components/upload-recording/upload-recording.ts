import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, tap } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideFileAudio, lucideUpload } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { ProcessTranscriptResponse } from '../../data/discovery.models';
import {
  RECORDING_ACCEPT,
  RecordingProblem,
  recordingProblem,
  titleFromFileName,
} from '../../data/recording-upload';
import { Modal } from '../../../../shared/components/modal/modal';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

/** Where an upload is: creating the session, transcribing the audio, then generating stories. */
type UploadStage = 'creating' | 'transcribing' | 'generating';

/**
 * Upload a past meeting's recording (US41): the analyst picks an audio file and a title, and the
 * recording goes through the same pipeline as a live session, applying the project's glossary and
 * context: a session is created, the audio is transcribed, and the AI extracts the stories.
 */
@Component({
  selector: 'app-upload-recording',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, TranslocoPipe, HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner],
  viewProviders: [provideIcons({ lucideCircleCheck, lucideFileAudio, lucideUpload })],
  template: `
    <app-modal [(open)]="open">
      <span modalTitle>{{ 'discovery.upload.title' | transloco }}</span>
      <div class="flex flex-col gap-4" data-testid="upload-recording">
        <p class="text-sm text-muted-foreground">
          {{ 'discovery.upload.description' | transloco }}
        </p>

        <label
          class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-accent"
          [class.pointer-events-none]="busy()"
        >
          <hlm-icon name="lucideFileAudio" size="22px" class="text-primary" />
          @if (file(); as f) {
            <span class="text-sm font-medium" data-testid="upload-file-name">{{ f.name }}</span>
            <span class="text-xs text-muted-foreground">{{ sizeLabel(f.size) }}</span>
          } @else {
            <span class="text-sm font-medium">{{ 'discovery.upload.choose' | transloco }}</span>
            <span class="text-xs text-muted-foreground">{{
              'discovery.upload.hint' | transloco
            }}</span>
          }
          <input
            type="file"
            class="sr-only"
            [accept]="accept"
            (change)="pick($any($event.target).files)"
            data-testid="upload-file"
          />
        </label>

        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="upload-title">{{ 'discovery.upload.titleLabel' | transloco }}</label>
          <input
            hlmInput
            id="upload-title"
            maxlength="200"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
            [disabled]="busy()"
            data-testid="upload-title"
          />
        </div>

        @if (problem(); as p) {
          <p class="text-sm text-destructive" role="alert" data-testid="upload-problem">
            {{ 'discovery.upload.problem.' + p | transloco }}
          </p>
        }

        @if (stage(); as current) {
          <ol class="flex flex-col gap-1.5 text-sm" data-testid="upload-progress" role="status">
            @for (s of stages; track s) {
              <li class="flex items-center gap-2" [class.text-muted-foreground]="!reached(s)">
                @if (s === current) {
                  <hlm-spinner class="h-4 w-4" />
                } @else if (reached(s)) {
                  <hlm-icon name="lucideCircleCheck" size="16px" class="text-verified" />
                } @else {
                  <span class="h-4 w-4 rounded-full border border-border"></span>
                }
                {{ 'discovery.upload.stage.' + s | transloco }}
              </li>
            }
          </ol>
        }
      </div>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="open.set(false)"
        [disabled]="busy()"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        type="button"
        (click)="submit()"
        [disabled]="!canSubmit()"
        data-testid="upload-submit"
      >
        @if (busy()) {
          <hlm-spinner class="h-4 w-4" />
        } @else {
          <hlm-icon name="lucideUpload" size="15px" />
        }
        {{ 'discovery.upload.submit' | transloco }}
      </button>
    </app-modal>
  `,
})
export class UploadRecording {
  private readonly api = inject(DiscoveryApiService);
  private readonly transloco = inject(TranslocoService);

  readonly open = model(false);
  readonly projectId = input.required<string>();
  /** Meeting language of the new session (BCP-47). */
  readonly language = input.required<string>();
  /** Emitted once the recording has been transcribed and its stories extracted. */
  readonly processed = output<ProcessTranscriptResponse>();
  /** Emitted with a localized message when the upload fails. */
  readonly failed = output<string>();

  protected readonly accept = RECORDING_ACCEPT;
  protected readonly stages: readonly UploadStage[] = ['creating', 'transcribing', 'generating'];
  protected readonly file = signal<File | null>(null);
  protected readonly title = signal('');
  /** The title last derived from a file name, replaced when another file is picked. */
  private autoTitle = '';
  protected readonly problem = signal<RecordingProblem | null>(null);
  protected readonly stage = signal<UploadStage | null>(null);
  protected readonly busy = () => this.stage() !== null;
  protected readonly canSubmit = () =>
    !this.busy() && !!this.file() && !this.problem() && this.title().trim().length > 0;

  protected pick(files: FileList | null): void {
    const file = files?.item(0) ?? null;
    const problem = file ? recordingProblem(file) : null;
    this.file.set(file);
    this.problem.set(problem);
    // Name the session after a valid file, unless the analyst already typed a title of their own.
    if (file && !problem && (!this.title().trim() || this.title() === this.autoTitle)) {
      this.autoTitle = titleFromFileName(file.name);
      this.title.set(this.autoTitle);
    }
  }

  protected reached(s: UploadStage): boolean {
    const current = this.stage();
    return current !== null && this.stages.indexOf(s) < this.stages.indexOf(current);
  }

  protected sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;
  }

  protected submit(): void {
    const file = this.file();
    if (!file || !this.canSubmit()) return;
    this.stage.set('creating');
    this.api
      .createSession(this.projectId(), { title: this.title().trim(), language: this.language() })
      .pipe(
        tap(() => this.stage.set('transcribing')),
        switchMap((session) => this.api.uploadAudio(session.id, file)),
        tap(() => this.stage.set('generating')),
        switchMap((session) => this.api.process(session.id)),
      )
      .subscribe({
        next: (result) => {
          this.reset();
          this.open.set(false);
          this.processed.emit(result);
        },
        error: (err: HttpErrorResponse) => {
          this.stage.set(null);
          this.failed.emit(messageForError(err, this.transloco));
        },
      });
  }

  private reset(): void {
    this.stage.set(null);
    this.file.set(null);
    this.title.set('');
    this.autoTitle = '';
    this.problem.set(null);
  }
}
