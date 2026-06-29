import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LANG_TO_LOCALE, Lang } from '../../core/i18n/language';

/** Largest-fitting relative-time unit boundaries, in ascending size. */
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'seconds' },
  { amount: 60, unit: 'minutes' },
  { amount: 24, unit: 'hours' },
  { amount: 7, unit: 'days' },
  { amount: 4.34524, unit: 'weeks' },
  { amount: 12, unit: 'months' },
  { amount: Number.POSITIVE_INFINITY, unit: 'years' },
];

/**
 * Relative time from a UTC/ISO date string or `Date` — e.g. `"hace 5 minutos"` / `"5 minutes ago"` —
 * using the native {@link Intl.RelativeTimeFormat} in the **active Transloco language**, so it
 * switches live when the user changes language.
 *
 * Impure so it reflects both language changes and the passage of time on each change-detection
 * pass (the relative value drifts as the clock moves).
 */
@Pipe({ name: 'fromNow', pure: false })
export class FromNowPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);
  private readonly formatters = new Map<string, Intl.RelativeTimeFormat>();

  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    let delta = (date.getTime() - Date.now()) / 1000; // seconds; negative = in the past
    for (const division of DIVISIONS) {
      if (Math.abs(delta) < division.amount) {
        return this.formatter().format(Math.round(delta), division.unit);
      }
      delta /= division.amount;
    }
    return '';
  }

  private formatter(): Intl.RelativeTimeFormat {
    const locale = LANG_TO_LOCALE[this.transloco.getActiveLang() as Lang] ?? 'en-US';
    let rtf = this.formatters.get(locale);
    if (!rtf) {
      rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      this.formatters.set(locale, rtf);
    }
    return rtf;
  }
}
