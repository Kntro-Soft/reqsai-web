import { Directive, ElementRef, computed, inject, input } from '@angular/core';
import { cn } from '../../utils/cn';

const BASE =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Text field styling. Inputs get the fixed control height; textareas instead grow with
 * their content (`field-sizing: content`, Chromium/Safari) from a two-line minimum, so
 * long story statements and Gherkin steps are never clipped behind a fixed `h-10`.
 */
@Directive({
  selector: 'input[hlmInput], textarea[hlmInput]',
  host: { '[class]': '_computedClass()' },
})
export class HlmInput {
  readonly userClass = input<string>('', { alias: 'class' });
  private readonly isTextarea =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName === 'TEXTAREA';
  protected readonly _computedClass = computed(() =>
    cn(
      BASE,
      this.isTextarea ? 'field-sizing-content min-h-16 resize-y leading-relaxed' : 'h-10',
      this.userClass(),
    ),
  );
}
