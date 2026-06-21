import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Temporary placeholder for sections still under construction. */
@Component({
  selector: 'app-coming-soon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid place-items-center py-24 text-center">
      <div class="flex max-w-sm flex-col items-center gap-3">
        <span class="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </span>
        <div>
          <p class="font-medium">Próximamente</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Esta sección estará disponible muy pronto.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class ComingSoon {}
