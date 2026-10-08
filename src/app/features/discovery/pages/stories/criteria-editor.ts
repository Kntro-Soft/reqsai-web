import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton, HlmIcon, HlmInput } from '../../../../shared/ui';
import { CriterionRow, emptyCriterionRow } from './story-form.helpers';

/**
 * Inline editor for a story's Given/When/Then acceptance criteria. Renders one
 * Gherkin row per criterion (optional scenario, then Dado/Cuando/Entonces with
 * the keyword in a label gutter and auto-growing fields) with add/remove
 * controls; an incomplete row is flagged in place. It owns the row array via a two-way `rows` model so the host page
 * can read the current rows on submit; `removed` emits a row's server id when an
 * already-persisted row is deleted, so the edit page can DELETE it immediately.
 */
@Component({
  selector: 'app-criteria-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, HlmInput, TranslocoPipe],
  viewProviders: [provideIcons({ lucidePlus, lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">{{ 'storyForm.criteriaTitle' | transloco }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ 'storyForm.criteriaHint' | transloco }}
          </p>
        </div>
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

      <ol class="flex flex-col">
        @for (row of rows(); track $index; let i = $index) {
          @let invalid = invalidIndexes().includes(i);
          <li
            class="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0"
            [attr.aria-invalid]="invalid || null"
            data-testid="criteria-row"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'discovery.suggestion.criterion' | transloco }} {{ i + 1 }}
              </span>
              @if (invalid) {
                <span class="text-xs font-medium text-destructive" role="alert">
                  {{ 'storyForm.criteriaIncomplete' | transloco }}
                </span>
              }
              <button
                type="button"
                (click)="removeRow(i)"
                [attr.aria-label]="'storyForm.criteriaRemove' | transloco"
                class="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                data-testid="criteria-remove"
              >
                <hlm-icon name="lucideTrash2" size="15px" />
              </button>
            </div>
            <!-- Gherkin layout: the keyword stays in a gutter beside each step. -->
            <div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
              <label
                class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
                [for]="'new-crit-' + i + '-scenario'"
                >{{ 'discovery.suggestion.scenario' | transloco }}</label
              >
              <input
                hlmInput
                [id]="'new-crit-' + i + '-scenario'"
                [value]="row.scenario"
                (input)="patch(i, 'scenario', $any($event.target).value)"
                [placeholder]="'discovery.suggestion.scenarioPlaceholder' | transloco"
                data-testid="criteria-scenario"
              />
              @for (step of steps; track step.key) {
                <label
                  class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
                  [for]="'new-crit-' + i + '-' + step.key"
                  >{{ step.label | transloco }}</label
                >
                <textarea
                  hlmInput
                  rows="1"
                  class="min-h-10"
                  [class.border-destructive]="invalid && !row[step.key].trim()"
                  [id]="'new-crit-' + i + '-' + step.key"
                  [value]="row[step.key]"
                  (input)="patch(i, step.key, $any($event.target).value)"
                  [attr.data-testid]="'criteria-' + step.key"
                ></textarea>
              }
            </div>
          </li>
        }
      </ol>
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

  protected readonly steps = [
    { key: 'given', label: 'storyForm.criteriaGiven' },
    { key: 'when', label: 'storyForm.criteriaWhen' },
    { key: 'then', label: 'storyForm.criteriaThen' },
  ] as const;

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
