import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowUpRight, lucideCodeXml } from '@ng-icons/lucide';
import { CodeReference } from '../../data/codebase.models';
import { LabelledReference, labelReferences } from '../../data/codebase';
import { hasLines, lineReferenceLabel, safeReferenceUrl } from '../../data/code-verification';
import { HlmIcon } from '../../../../shared/ui';

/**
 * The places of the client's code a suggestion, story or chat reply points at, as chips. A place in
 * a file reads `path:lineStart-lineEnd` and opens those lines on GitHub in a new tab; a module (the
 * only kind older references have) shows its name and opens the folder. A chip without a usable
 * link is plain text.
 */
@Component({
  selector: 'app-code-references',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideArrowUpRight, lucideCodeXml })],
  template: `
    @if (items().length > 0) {
      <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="labelKey() | transloco">
        @for (ref of items(); track ref.repository + ':' + ref.label + ':' + (ref.url ?? '')) {
          <li class="min-w-0 max-w-full">
            @if (link(ref); as href) {
              <a
                [href]="href"
                target="_blank"
                rel="noopener noreferrer"
                [title]="title(ref)"
                class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [attr.data-testid]="chipTestId()"
              >
                <hlm-icon name="lucideCodeXml" size="12px" class="shrink-0" aria-hidden="true" />
                @if (place(ref); as at) {
                  <span class="min-w-0 truncate font-mono">{{ at.file }}</span
                  ><span class="shrink-0 font-mono">{{ at.lines }}</span>
                } @else {
                  <span class="truncate">{{ ref.label }}</span>
                }
                <hlm-icon
                  name="lucideArrowUpRight"
                  size="12px"
                  class="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span class="sr-only">{{
                  'discovery.suggestion.code.opensGitHub' | transloco
                }}</span>
              </a>
            } @else {
              <span
                [title]="title(ref)"
                class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground"
                [attr.data-testid]="chipTestId()"
              >
                <hlm-icon name="lucideCodeXml" size="12px" class="shrink-0" aria-hidden="true" />
                @if (place(ref); as at) {
                  <span class="min-w-0 truncate font-mono">{{ at.file }}</span
                  ><span class="shrink-0 font-mono">{{ at.lines }}</span>
                } @else {
                  <span class="truncate">{{ ref.label }}</span>
                }
              </span>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class CodeReferences {
  readonly references = input<readonly CodeReference[] | null | undefined>([]);
  /** i18n key of the list's accessible name. */
  readonly labelKey = input('discovery.suggestion.code.references');
  readonly chipTestId = input('code-ref');

  protected readonly items = computed<LabelledReference[]>(() => {
    const refs = this.references();
    return labelReferences(Array.isArray(refs) ? refs : []);
  });

  protected link(ref: CodeReference): string | null {
    return safeReferenceUrl(ref.url);
  }

  /** A place in a file as its path (which may be cut) and its lines (which never are). */
  protected place(ref: CodeReference): { file: string; lines: string } | null {
    const label = lineReferenceLabel(ref);
    if (!label || !ref.file) return null;
    return { file: ref.file, lines: label.slice(ref.file.length) };
  }

  /** The tooltip: the quoted line for a place in a file, the module's place in the repository otherwise. */
  protected title(ref: CodeReference): string {
    if (hasLines(ref)) {
      return ref.quote ? `${ref.repository} · ${ref.quote}` : `${ref.repository}/${ref.file}`;
    }
    return ref.path ? `${ref.repository}/${ref.path}` : ref.repository;
  }
}
