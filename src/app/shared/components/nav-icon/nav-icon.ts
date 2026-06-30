import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideLayoutDashboard,
  lucideList,
  lucideMic,
  lucideSettings,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmIcon } from '../../ui';

/** Maps a semantic nav name to a Lucide icon and renders it via {@link HlmIcon}.
 * Keeps the call sites (`<app-nav-icon name="projects">`) stable while the icons
 * come from `@ng-icons/lucide` instead of hand-pasted SVG paths. */
const NAV_ICONS: Record<string, string> = {
  overview: 'lucideLayoutDashboard',
  projects: 'lucideFolder',
  sessions: 'lucideMic',
  stories: 'lucideList',
  members: 'lucideUsers',
  settings: 'lucideSettings',
};

@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon],
  viewProviders: [
    provideIcons({
      lucideLayoutDashboard,
      lucideFolder,
      lucideMic,
      lucideList,
      lucideUsers,
      lucideSettings,
    }),
  ],
  template: `<hlm-icon [name]="icon()" [size]="size() + 'px'" />`,
})
export class NavIcon {
  readonly name = input.required<string>();
  readonly size = input(19);

  protected readonly icon = computed(() => NAV_ICONS[this.name()] ?? 'lucideCircleHelp');
}
