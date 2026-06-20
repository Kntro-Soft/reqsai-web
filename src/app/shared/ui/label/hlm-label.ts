import { Directive, computed, input } from '@angular/core';
import { cn } from '../../utils/cn';

@Directive({
  selector: 'label[hlmLabel]',
  host: { '[class]': '_computedClass()' },
})
export class HlmLabel {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      this.userClass(),
    ),
  );
}
