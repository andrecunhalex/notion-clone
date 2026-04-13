// ---------------------------------------------------------------------------
// Search helpers with per-resource caching
// ---------------------------------------------------------------------------
// `templateSearchBlob` / `clauseSearchBlob` build a normalized, lowercased
// string containing the name + text content of every editable/swappable slot.
// These blobs are used by the picker's search filter.
//
// Building a blob is O(n) over the template's defaults and involves HTML
// parsing — not expensive per call, but noticeable when re-computed for every
// resource on every keystroke of the search input. We cache by object identity
// so unchanged resources get their blob in O(1) on subsequent filter passes.
// Because the library store creates new object references whenever it commits
// (never mutates in place), identity-based caching is both correct and simple.
// ---------------------------------------------------------------------------

import type { LibraryTemplate, LibraryClause } from './types';

const templateBlobs = new WeakMap<LibraryTemplate, string>();
const clauseBlobs = new WeakMap<LibraryClause, string>();

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

export function getTemplateSearchBlob(t: LibraryTemplate): string {
  const cached = templateBlobs.get(t);
  if (cached !== undefined) return cached;
  const valueText = Object.values(t.defaults || {}).map(htmlToText).join(' ');
  const blob = normalize(`${t.name} ${valueText}`);
  templateBlobs.set(t, blob);
  return blob;
}

export function getClauseSearchBlob(
  c: LibraryClause,
  templatesById: Map<string, LibraryTemplate>,
): string {
  const cached = clauseBlobs.get(c);
  if (cached !== undefined) return cached;
  const parts: string[] = [c.name];
  for (const item of c.items) {
    const tpl = templatesById.get(item.templateId);
    if (tpl) parts.push(tpl.name);
    for (const v of Object.values(item.values || {})) parts.push(htmlToText(v));
  }
  const blob = normalize(parts.join(' '));
  clauseBlobs.set(c, blob);
  return blob;
}

/** Apply a normalized search query to a resource via its cached blob */
export function matchesTemplate(t: LibraryTemplate, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return getTemplateSearchBlob(t).includes(normalizedQuery);
}

export function matchesClause(
  c: LibraryClause,
  templatesById: Map<string, LibraryTemplate>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  return getClauseSearchBlob(c, templatesById).includes(normalizedQuery);
}
