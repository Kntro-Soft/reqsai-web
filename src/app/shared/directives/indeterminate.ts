import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Reflects a bound boolean onto a checkbox's `.indeterminate` DOM property, which has no HTML
 * attribute and so can't be set via template binding. Used by the permission-matrix "select all"
 * group headers for the tri-state (all / some / none) checkbox pattern.
 */
@Directive({
  selector: 'input[type=checkbox][appIndeterminate]',
})
export class Indeterminate {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  readonly appIndeterminate = input(false);

  constructor() {
    effect(() => {
      this.el.nativeElement.indeterminate = this.appIndeterminate();
    });
  }
}
