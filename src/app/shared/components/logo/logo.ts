import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Brand lockup: the ReqsAI symbol mark (constellation) plus the wordmark.
 * The symbol is icon-only, so the text provides the accessible name; when the
 * text is hidden the image carries the alt instead.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-2">
      <img
        src="/assets/img/reqsai-combination-mark-original.webp"
        [attr.alt]="showText() ? '' : 'Reqs-AI'"
        [attr.aria-hidden]="showText() ? 'true' : null"
        [width]="size()"
        [height]="size()"
        [style.height.px]="size()"
        [style.width.px]="size()"
        class="shrink-0 object-contain"
      />
      @if (showText()) {
        <span class="font-semibold tracking-tight text-foreground">Reqs-AI</span>
      }
    </span>
  `,
})
export class Logo {
  readonly size = input(32);
  readonly showText = input(true);
}
