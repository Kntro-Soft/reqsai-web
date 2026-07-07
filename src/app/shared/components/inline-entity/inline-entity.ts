import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Avatar } from '../avatar/avatar';

/**
 * An entity's small circular logo followed by its bold name, laid out inline so it can sit inside a
 * sentence (Vercel-style: "This will permanently delete [logo] Acme and all its data…"). Reused by
 * the org danger-zone and member confirmation modals.
 */
@Component({
  selector: 'app-inline-entity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center align-middle leading-none' },
  imports: [Avatar],
  template: `
    <span class="inline-flex items-center gap-1.5 font-semibold text-foreground">
      <app-avatar
        [name]="name()"
        [seed]="seed()"
        [imageUrl]="imageUrl()"
        [size]="size()"
        [circle]="true"
      />
      {{ name() }}
    </span>
  `,
})
export class InlineEntity {
  /** Display name; also drives the monogram fallback. */
  readonly name = input<string>('');
  /** Stable color seed (entity id). */
  readonly seed = input<string>('');
  /** Optional avatar image URL. */
  readonly imageUrl = input<string | null>(null);
  /** Pixel size of the logo. */
  readonly size = input<number>(18);
}
