import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';

/**
 * A signal of a `translate(key)` function that stays `null` until the active language's
 * translations have finished loading, then re-emits on every language change.
 *
 * Use it to build arrays of translated labels (e.g. `<app-select>` options) inside a `computed`:
 * gate on the returned function and you never call `TranslocoService.translate()` during the
 * initial async load — which otherwise logs a spurious "Missing translation" warning even for keys
 * that exist, because the JSON isn't in memory yet at that first synchronous call.
 */
export function translateFn(transloco: TranslocoService): Signal<((key: string) => string) | null> {
  return toSignal(
    transloco.selectTranslation().pipe(map(() => (key: string) => transloco.translate(key))),
    { initialValue: null },
  );
}
