import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';
import { ThemeService } from '../../../core/theme/theme.service';
import { HlmButton, HlmIcon } from '../../ui';

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon],
  viewProviders: [provideIcons({ lucideSun, lucideMoon })],
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon"
      type="button"
      (click)="theme.toggle()"
      [attr.aria-label]="theme.resolved() === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'"
    >
      @if (theme.resolved() === 'dark') {
        <hlm-icon name="lucideSun" size="18px" />
      } @else {
        <hlm-icon name="lucideMoon" size="18px" />
      }
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
