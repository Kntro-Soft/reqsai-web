import { Directive, computed, input } from '@angular/core';
import { cn } from '../../utils/cn';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning';

const BASE =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive text-white',
  outline: 'text-foreground border-border',
  success: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

@Directive({
  selector: '[hlmBadge]',
  host: { '[class]': '_computedClass()' },
})
export class HlmBadge {
  readonly variant = input<BadgeVariant>('default');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn(BASE, VARIANTS[this.variant()], this.userClass()),
  );
}
