/** One part of a whole (a status, a decision, a role). `color` is any CSS colour, normally a `--chart-*` token. */
export interface ChartSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value per entry of the chart's `labels`. */
  values: number[];
}

export interface StatTrend {
  direction: 'up' | 'down' | 'flat';
  /** Whether this direction is good news, bad news or just information. */
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}
