import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '../../utils/cn';

/**
 * A themed placeholder block used while content loads. Renders a muted rounded box
 * with a subtle left-to-right shimmer sweep; pass sizing/shape via `class`
 * (e.g. `class="h-4 w-32 rounded"`). The sweep is disabled under
 * `prefers-reduced-motion` (falls back to a static muted block).
 */
@Component({
  selector: 'hlm-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="_computedClass()" aria-hidden="true"></span>`,
})
export class HlmSkeleton {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('block h-4 w-full rounded-md bg-muted skeleton-shimmer', this.userClass()),
  );
}
