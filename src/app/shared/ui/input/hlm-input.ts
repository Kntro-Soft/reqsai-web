import { Directive, computed, input } from '@angular/core';
import { cn } from '../../utils/cn';

@Directive({
  selector: 'input[hlmInput], textarea[hlmInput]',
  host: { '[class]': '_computedClass()' },
})
export class HlmInput {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
        'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none ' +
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
        'disabled:cursor-not-allowed disabled:opacity-50',
      this.userClass(),
    ),
  );
}
