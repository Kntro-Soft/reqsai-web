import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmIcon } from '../../ui';

/**
 * Tag/chip input: type a value and press Enter to add it as a chip shown below the field. No
 * comma parsing. Two-way bound via `[(value)]` to a string[]. Skips blanks and duplicates.
 */
@Component({
  selector: 'app-chip-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon],
  viewProviders: [provideIcons({ lucideX })],
  template: `
    <div class="flex flex-col gap-2">
      <input
        type="text"
        [placeholder]="placeholder()"
        (keydown.enter)="add($event); $event.preventDefault()"
        (blur)="add($event)"
        class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      @if (value().length) {
        <div class="flex flex-wrap gap-1.5">
          @for (tag of value(); track tag; let i = $index) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              {{ tag }}
              <button
                type="button"
                (click)="remove(i)"
                class="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="remove"
              >
                <hlm-icon name="lucideX" size="12px" />
              </button>
            </span>
          }
        </div>
      }
    </div>
  `,
})
export class ChipInput {
  readonly value = model<string[]>([]);
  readonly placeholder = input('');

  protected add(event: Event): void {
    const input = event.target as HTMLInputElement;
    const tag = input.value.trim();
    if (tag && !this.value().includes(tag)) this.value.update((tags) => [...tags, tag]);
    input.value = '';
  }

  protected remove(index: number): void {
    this.value.update((tags) => tags.filter((_, i) => i !== index));
  }
}
