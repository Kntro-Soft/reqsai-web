import { Directive, computed, input } from '@angular/core';
import { cn } from '../../utils/cn';

@Directive({
  selector: '[hlmCard]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCard {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', this.userClass()),
  );
}

@Directive({
  selector: '[hlmCardHeader]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCardHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('flex flex-col gap-1.5 p-6', this.userClass()),
  );
}

@Directive({
  selector: '[hlmCardTitle]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCardTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('text-lg font-semibold leading-none tracking-tight', this.userClass()),
  );
}

@Directive({
  selector: '[hlmCardDescription]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCardDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('text-sm text-muted-foreground', this.userClass()),
  );
}

@Directive({
  selector: '[hlmCardContent]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCardContent {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() => cn('p-6 pt-0', this.userClass()));
}

@Directive({
  selector: '[hlmCardFooter]',
  host: { '[class]': '_computedClass()' },
})
export class HlmCardFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    cn('flex items-center p-6 pt-0', this.userClass()),
  );
}
