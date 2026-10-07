import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AcceptanceCriterion } from '../../data/discovery.models';

/**
 * Read-only Given/When/Then rendering of one acceptance criterion: the optional
 * scenario as a heading, then one step per line behind a fixed keyword gutter, so
 * a criterion reads like a Gherkin scenario instead of a run-on sentence. Shared
 * by the suggestion card and the side panel's story cards.
 */
@Component({
  selector: 'app-gherkin-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @let c = criterion();
    @if (c.scenario) {
      <p
        class="mb-1 font-medium text-foreground"
        [class.text-sm]="size() === 'md'"
        [class.text-xs]="size() === 'sm'"
      >
        {{ c.scenario }}
      </p>
    }
    <dl
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"
      [class.gap-y-1]="size() === 'md'"
      [class.gap-y-0.5]="size() === 'sm'"
      data-testid="gherkin-steps"
    >
      @for (step of steps; track step.key) {
        <dt
          class="pt-[0.2rem] text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
        >
          {{ step.label | transloco }}
        </dt>
        <dd
          class="leading-relaxed text-foreground"
          [class.text-sm]="size() === 'md'"
          [class.text-xs]="size() === 'sm'"
        >
          {{ c[step.key] }}
        </dd>
      }
    </dl>
  `,
})
export class GherkinSteps {
  readonly criterion = input.required<AcceptanceCriterion>();
  /** `sm` for dense lists (side panel), `md` for the suggestion card. */
  readonly size = input<'sm' | 'md'>('md');

  protected readonly steps = [
    { key: 'given', label: 'discovery.suggestion.criteriaGiven' },
    { key: 'when', label: 'discovery.suggestion.criteriaWhen' },
    { key: 'then', label: 'discovery.suggestion.criteriaThen' },
  ] as const;
}
