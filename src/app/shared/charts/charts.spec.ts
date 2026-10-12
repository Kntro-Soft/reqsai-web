import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { ChartSegment, LineSeries } from './chart.models';
import { Donut } from './donut';
import { LineChart } from './line-chart';
import { Meter } from './meter';
import { StackedBar } from './stacked-bar';

const transloco = TranslocoTestingModule.forRoot({
  langs: {
    en: {
      charts: {
        showTable: 'Show as table',
        showChart: 'Show chart',
        week: 'Week',
        weekOf: 'Week of {{date}}',
      },
    },
  },
  translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
  preloadLangs: true,
});

/** The visible words of an element's child spans, in order ("Approved 3 75%"), whatever the markup spacing. */
const words = (el: Element | null | undefined) =>
  Array.from(el?.querySelectorAll('span') ?? [])
    .map((span) => span.textContent?.trim())
    .filter(Boolean)
    .join(' ');

const segments: ChartSegment[] = [
  { key: 'a', label: 'Approved', value: 3, color: 'red' },
  { key: 'b', label: 'Draft', value: 1, color: 'blue' },
  { key: 'c', label: 'Rejected', value: 0, color: 'gray' },
];

describe('StackedBar', () => {
  it('draws only the parts that have a value but lists every part with its share', () => {
    TestBed.configureTestingModule({ imports: [StackedBar, transloco] });
    const fixture = TestBed.createComponent(StackedBar);
    fixture.componentRef.setInput('segments', segments);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.chart-tip')).toHaveLength(2);
    const rows = Array.from(el.querySelectorAll('li')).map((li) => words(li));
    expect(rows).toEqual(['Approved 3 75%', 'Draft 1 25%', 'Rejected 0 0%']);
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Approved: 3, Draft: 1, Rejected: 0',
    );
  });
});

describe('Donut', () => {
  it('summarizes the parts for assistive technology and shows the headline in the hole', () => {
    TestBed.configureTestingModule({ imports: [Donut, transloco] });
    const fixture = TestBed.createComponent(Donut);
    fixture.componentRef.setInput('segments', segments);
    fixture.componentRef.setInput('centerValue', '75%');
    fixture.componentRef.setInput('centerLabel', 'accepted');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe(
      '75% accepted: Approved 3, Draft 1, Rejected 0',
    );
    expect(el.querySelectorAll('circle[stroke-dasharray]')).toHaveLength(2);
    expect(el.textContent).toContain('75%');
  });
});

describe('Meter', () => {
  it('exposes its ratio as a meter and clamps a value past the limit', () => {
    TestBed.configureTestingModule({ imports: [Meter, transloco] });
    const fixture = TestBed.createComponent(Meter);
    fixture.componentRef.setInput('label', 'Tokens');
    fixture.componentRef.setInput('value', 150);
    fixture.componentRef.setInput('max', 100);
    fixture.componentRef.setInput('valueText', '150 / 100');
    fixture.detectChanges();
    const meter = (fixture.nativeElement as HTMLElement).querySelector('[role="meter"]')!;

    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe('150 / 100');
  });
});

@Component({
  imports: [LineChart],
  template: `<app-line-chart [labels]="labels" [series]="series" ariaLabel="Weekly activity" />`,
})
class LineHost {
  labels = ['2026-09-28', '2026-10-05', '2026-10-12'];
  series: LineSeries[] = [
    { key: 's', label: 'Stories', color: 'red', values: [1, 4, 2] },
    { key: 'x', label: 'Sessions', color: 'blue', values: [0, 1, 3] },
  ];
}

describe('LineChart', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [LineHost, transloco] });
    const fixture = TestBed.createComponent(LineHost);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('names the chart, keys each series in a legend with its total and draws one path per series', () => {
    const { el } = render();

    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('Weekly activity');
    expect(el.querySelectorAll('svg path')).toHaveLength(2);
    const legend = Array.from(el.querySelectorAll('ul li')).map((li) => words(li));
    expect(legend).toEqual(['Stories 7', 'Sessions 4']);
  });

  it('reads out every series at the week the arrow keys land on', () => {
    const { fixture, el } = render();
    const svg = el.querySelector('svg')!;

    svg.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="line-readout"]')?.textContent).toContain('2');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    const readout = el.querySelector('[data-testid="line-readout"]')!;
    const rows = Array.from(readout.querySelectorAll(':scope > div:not(:first-child)')).map((row) =>
      words(row),
    );
    expect(rows).toEqual(['4 Stories', '1 Sessions']);
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="line-readout"]')).toBeNull();
  });

  it('swaps the plot for the same numbers in a table', () => {
    const { fixture, el } = render();

    (el.querySelector('[data-testid="chart-table-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('svg')).toBeNull();
    const rows = Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th,td')).map((c) => c.textContent?.trim()),
    );
    expect(rows).toHaveLength(3);
    expect(rows[1].slice(1)).toEqual(['4', '1']);
  });
});
