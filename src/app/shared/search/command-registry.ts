import { Injectable, computed, signal } from '@angular/core';
import { fuzzyScore } from './fuzzy';

/** A single searchable/actionable entry surfaced by the command palette. */
export interface SearchItem {
  id: string;
  /** Primary display text, and the main thing the query matches against. */
  label: string;
  /** i18n key (or literal) for the group/category hint shown on the right. */
  group: string;
  /** lucide icon name, or null to render an avatar instead. */
  icon: string | null;
  avatarName?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  /** Extra text matched by the query (aliases, breadcrumb path, keywords). */
  keywords?: string;
  /** Invoked when the item is activated. */
  run: () => void;
}

/**
 * A dynamic source of {@link SearchItem}s. Invoked on demand; it may read Angular signals so its
 * results stay live (e.g. the current organizations/projects). Return a fresh array each call.
 */
export type SearchSource = () => SearchItem[];

/**
 * Framework-agnostic command/search registry that powers the ⌘K palette.
 *
 * Features register {@link SearchSource}s at runtime; the palette reads {@link search} to render a
 * filtered, grouped, keyboard-navigable list. Everything app-specific lives in the registered
 * sources — this service (plus {@link SearchItem}) is self-contained and can be lifted into another
 * project unchanged. Sources are dynamic: because {@link items} is a `computed`, any signal a source
 * reads is tracked, so results update automatically (per user / per active org) with no manual
 * refresh. To add server-backed universal search later, register another source that queries the
 * backend — the palette needs no changes.
 */
@Injectable({ providedIn: 'root' })
export class CommandRegistry {
  private readonly sources = signal<readonly SearchSource[]>([]);

  /** Register a source. Returns an unregister function (call it in a component's cleanup). */
  register(source: SearchSource): () => void {
    this.sources.update((list) => [...list, source]);
    return () => this.sources.update((list) => list.filter((s) => s !== source));
  }

  /** Every item from every registered source, de-duplicated by id (the first source to yield an id
   * wins, so a richer local item beats a backend echo of the same entity); reactive to the signals
   * those sources read. */
  readonly items = computed<SearchItem[]>(() => {
    const seen = new Set<string>();
    const out: SearchItem[] = [];
    for (const source of this.sources()) {
      for (const item of source()) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  });

  /**
   * The items matching `query`, ranked by a fuzzy (subsequence) score against the label and
   * keywords; a substring match acts as a score floor so exact substrings never rank below a
   * looser subsequence hit. Returns all items unranked when the query is blank.
   */
  search(query: string): SearchItem[] {
    const q = query.trim();
    const items = this.items();
    if (!q) return items;
    const scored: { item: SearchItem; score: number }[] = [];
    for (const item of items) {
      const labelScore = fuzzyScore(q, item.label);
      const keywordScore = item.keywords ? fuzzyScore(q, item.keywords) : 0;
      const score = Math.max(labelScore, keywordScore);
      if (score > 0) scored.push({ item, score });
    }
    // Stable sort by descending score (Array.prototype.sort is stable in modern engines),
    // so items with equal scores keep their registration order.
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }
}
