import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton, HlmIcon, HlmInput, HlmLabel } from '../../../../shared/ui';
import { CriterionRow, emptyCriterionRow } from './story-form.helpers';

/**
 * Inline editor for a story's Given/When/Then acceptance criteria. Renders one
 * card per row (optional scenario heading + G/W/T textareas) with add/remove
 * controls. It owns the row array via a two-way `rows` model so the host page
 * can read the current rows on submit; `removed` emits a row's server id when an
 * already-persisted row is deleted, so the edit page can DELETE it immediately.
 */
@Component({
  selector: 'app-criteria-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, HlmInput, HlmLabel, TranslocoPipe],
  viewProviders: [provideIcons({ lucidePlus, lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span hlmLabel>{{ 'storyForm.criteriaTitle' | transloco }}</span>
        <button
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          (click)="addRow()"
          data-testid="criteria-add"
        >
          <hlm-icon name="lucidePlus" size="14px" />
          {{ 'storyForm.criteriaAdd' | transloco }}
        </button>
      </div>

      @if (rows().length === 0) {
        <p
          class="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
        >
          {{ 'storyForm.criteriaEmpty' | transloco }}
        </p>
      }

      @for (row of rows(); track $index; let i = $index) {
        <div
          class="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
          [class.border-destructive]="invalidIndexes().includes(i)"
          data-testid="criteria-row"
        >
          <div class="flex items-start gap-2">
            <input
              hlmInput
              class="flex-1"
              [value]="row.scenario"
              (input)="patch(i, 'scenario', $any($event.target).value)"
              [placeholder]="'storyForm.criteriaScenario' | transloco"
              data-testid="criteria-scenario"
            />
            <button
              type="button"
              (click)="removeRow(i)"
              [attr.aria-label]="'storyForm.criteriaRemove' | transloco"
              class="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid="criteria-remove"
            >
              <hlm-icon name="lucideTrash2" size="15px" />
            </button>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <label hlmLabel class="flex flex-col gap-1 text-xs">
              {{ 'storyForm.criteriaGiven' | transloco }}
              <textarea
                hlmInput
                rows="2"
                [value]="row.given"
                (input)="patch(i, 'given', $any($event.target).value)"
                data-testid="criteria-given"
              ></textarea>
            </label>
            <label hlmLabel class="flex flex-col gap-1 text-xs">
              {{ 'storyForm.criteriaWhen' | transloco }}
              <textarea
                hlmInput
                rows="2"
                [value]="row.when"
                (input)="patch(i, 'when', $any($event.target).value)"
                data-testid="criteria-when"
              ></textarea>
            </label>
            <label hlmLabel class="flex flex-col gap-1 text-xs">
              {{ 'storyForm.criteriaThen' | transloco }}
              <textarea
                hlmInput
                rows="2"
                [value]="row.then"
                (input)="patch(i, 'then', $any($event.target).value)"
                data-testid="criteria-then"
              ></textarea>
            </label>
          </div>
        </div>
      }
    </div>
  `,
})
export class CriteriaEditor {
  /** The editable rows (two-way): the host reads them on submit. */
  readonly rows = model.required<CriterionRow[]>();
  /** Zero-based indexes to flag as invalid (partially filled on submit). */
  readonly invalidIndexes = input<number[]>([]);
  /** Emits the server id of a persisted row when it is removed (edit page DELETE). */
  readonly removed = output<string>();

  protected addRow(): void {
    this.rows.update((list) => [...list, emptyCriterionRow()]);
  }

  protected removeRow(index: number): void {
    const row = this.rows()[index];
    if (row?.id) this.removed.emit(row.id);
    this.rows.update((list) => list.filter((_, i) => i !== index));
  }

  protected patch(index: number, key: keyof CriterionRow, value: string): void {
    this.rows.update((list) =>
      list.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
}
