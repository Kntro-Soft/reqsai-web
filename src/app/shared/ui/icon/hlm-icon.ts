import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { cn } from '../../utils/cn';

/** Vendored Spartan-style icon wrapper around {@link NgIcon}. Icons are registered with
 * `provideIcons(...)` (app- or component-level); the name is the registered key, e.g.
 * `lucideFolder`. Inherits color from `currentColor` so it tints with the surrounding text. */
@Component({
  selector: 'hlm-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  // inline-flex on the host so the icon centers within line boxes instead of sitting on the text
  // baseline (which made it look pushed up inside flex buttons).
  host: { class: 'inline-flex items-center justify-center' },
  template: `<ng-icon [name]="name()" [size]="size()" [class]="computedClass()" />`,
})
export class HlmIcon {
  readonly name = input.required<string>();
  /** CSS size, e.g. `1.2rem` or `19px`. */
  readonly size = input('1.15rem');
  readonly class = input('');

  protected readonly computedClass = computed(() => cn('inline-flex shrink-0', this.class()));
}
