/** What Spotlight matches a result by. */
export interface Searchable {
  label: string;
  hint: string;
  /** Other words it's found by, which aren't shown (a Preferences pane's). */
  keywords?: string;
}

/** Whether Spotlight finds `result` for `query`: the query is part of its name, its hint or its keywords. */
export function spotlightFinds(result: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  return `${result.label} ${result.hint} ${result.keywords ?? ''}`.toLowerCase().includes(q);
}
