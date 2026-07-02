import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

/** Deterministic 32-bit hash of a string, for stable per-entity colors. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Entity avatar. Renders an image when one is provided, otherwise a deterministic monogram:
 * the first letter of the name on a gradient derived from a stable seed (the entity id), so the
 * same organization/project/user always gets the same color. No backend avatar needed.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-grid shrink-0 place-items-center overflow-hidden font-semibold text-white select-none"
      [class.rounded-full]="circle()"
      [class.rounded-lg]="!circle()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.fontSize.px]="size() * 0.42"
      [style.background]="showImage() ? null : gradient()"
      [attr.title]="name()"
      [attr.aria-label]="name()"
    >
      @if (showImage()) {
        <img
          [src]="imageUrl()"
          [alt]="name()"
          (error)="failed.set(true)"
          class="h-full w-full object-cover"
        />
      } @else {
        {{ initial() }}
      }
    </span>
  `,
})
export class Avatar {
  /** Display name; its first letter is the monogram. */
  readonly name = input<string>('');
  /** Stable seed for the color (entity id). Falls back to the name. */
  readonly seed = input<string>('');
  /** Pixel size of the square/circle. */
  readonly size = input<number>(32);
  /** Circular (default) vs a rounded square. Logos across the app are circular. */
  readonly circle = input<boolean>(true);
  /** When set, the image is shown instead of the monogram. */
  readonly imageUrl = input<string | null>(null);

  // Falls back to the monogram if the image fails to load; resets when the URL changes.
  protected readonly failed = linkedSignal<boolean>(() => {
    this.imageUrl();
    return false;
  });
  protected readonly showImage = computed(() => !!this.imageUrl() && !this.failed());

  private readonly key = computed(() => this.seed() || this.name() || '?');

  protected readonly initial = computed(() => (this.name().trim()[0] ?? '?').toUpperCase());

  protected readonly gradient = computed(() => {
    const hue = hashString(this.key()) % 360;
    return `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 70% 45%))`;
  });
}
