import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideBookMarked,
  lucideChartLine,
  lucideCreditCard,
  lucideFolder,
  lucideKey,
  lucideLayoutDashboard,
  lucideList,
  lucideLock,
  lucideMic,
  lucidePalette,
  lucidePlug,
  lucideRuler,
  lucideSettings,
  lucideShield,
  lucideSlidersHorizontal,
  lucideTriangleAlert,
  lucideUser,
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
  glossary: 'lucideBookMarked',
  constraints: 'lucideRuler',
  members: 'lucideUsers',
  settings: 'lucideSettings',
  // Settings sub-nav.
  general: 'lucideSlidersHorizontal',
  roles: 'lucideShield',
  billing: 'lucideCreditCard',
  integrations: 'lucidePlug',
  usage: 'lucideChartLine',
  danger: 'lucideTriangleAlert',
  // Account sub-nav.
  profile: 'lucideUser',
  security: 'lucideLock',
  appearance: 'lucidePalette',
  notifications: 'lucideBell',
  tokens: 'lucideKey',
};

@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center justify-center' },
  imports: [HlmIcon],
  viewProviders: [
    provideIcons({
      lucideLayoutDashboard,
      lucideFolder,
      lucideMic,
      lucideList,
      lucideBookMarked,
      lucideRuler,
      lucideUsers,
      lucideSettings,
      lucideShield,
      lucideSlidersHorizontal,
      lucideCreditCard,
      lucidePlug,
      lucideChartLine,
      lucideTriangleAlert,
      lucideUser,
      lucideLock,
      lucidePalette,
      lucideBell,
      lucideKey,
    }),
  ],
  template: `<hlm-icon [name]="icon()" [size]="size() + 'px'" />`,
})
export class NavIcon {
  readonly name = input.required<string>();
  readonly size = input(19);

  protected readonly icon = computed(() => NAV_ICONS[this.name()] ?? 'lucideCircleHelp');
}
