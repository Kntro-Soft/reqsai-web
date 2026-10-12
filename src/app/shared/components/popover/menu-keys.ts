import { AfterViewInit, Directive, ElementRef, inject, output } from '@angular/core';

/**
 * Keyboard behaviour of a popover menu (the WAI-ARIA menu pattern): focus lands on the checked
 * item (else the first) when the menu opens, Arrow Up/Down move between items and wrap, Home/End
 * jump to the ends, and Escape or Tab ask the owner to close. Items are the descendants with a
 * `menuitem*` role. The owner restores focus to its trigger when it handles `dismiss`.
 */
@Directive({
  selector: '[appMenuKeys]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class MenuKeys implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Escape or Tab was pressed: the menu should close and hand focus back. */
  readonly dismiss = output<void>();

  ngAfterViewInit(): void {
    const items = this.items();
    (items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      this.dismiss.emit();
      return;
    }
    const items = this.items();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next = current <= 0 ? items.length - 1 : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next].focus();
  }

  private items(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([disabled]):not([hidden])',
      ),
    );
  }
}
