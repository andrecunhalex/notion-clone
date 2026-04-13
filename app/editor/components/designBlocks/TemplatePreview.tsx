'use client';

// ---------------------------------------------------------------------------
// TemplatePreview — shared static preview for design block templates
// ---------------------------------------------------------------------------
// Wraps `dangerouslySetInnerHTML` with a memoized HTML builder. The actual
// HTML build is cached so re-rendering N cards on every search keystroke
// doesn't re-parse N HTML strings.
//
// Cache key: identity of the template (re-built only when the library
// commits a new template object) PLUS a JSON serialization of the values
// override (only used in clause previews where each item carries its own
// values). Templates are short and few, so JSON.stringify is cheap.
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import { buildPreviewHtml } from './previewHtml';
import { sanitizeTemplateHtml } from '../../designLibrary/sanitizeTemplate';
import type { LibraryTemplate } from '../../designLibrary';
import type { DesignBlockTemplate } from './registry';

interface PreviewCacheEntry {
  /** Cached preview keyed by `JSON.stringify(values)` (or 'default' when none) */
  byValueKey: Map<string, string>;
}

// Identity-keyed cache. WeakMap means library mutations that replace a
// template object automatically invalidate its cache entry on the next GC
// pass — no manual eviction needed.
const previewCache = new WeakMap<DesignBlockTemplate, PreviewCacheEntry>();

function getCachedPreview(template: DesignBlockTemplate, values?: Record<string, string>): string {
  let entry = previewCache.get(template);
  if (!entry) {
    entry = { byValueKey: new Map() };
    previewCache.set(template, entry);
  }
  const valueKey = values ? JSON.stringify(values) : 'default';
  const cached = entry.byValueKey.get(valueKey);
  if (cached !== undefined) return cached;
  // Defense in depth: even though the library sanitizes on write, we
  // sanitize again on render. If a row ever lands in the snapshot via a
  // path that bypasses the library interface (manual SQL, future import
  // pipeline, malicious payload from a compromised member), the preview
  // still strips dangerous markup before injecting it via innerHTML.
  // Cached, so the cost is paid at most once per (template, values) pair.
  const html = sanitizeTemplateHtml(buildPreviewHtml(template, values));
  entry.byValueKey.set(valueKey, html);
  return html;
}

interface TemplatePreviewProps {
  template: LibraryTemplate | DesignBlockTemplate;
  /** Per-instance value overrides (e.g. for clause items) */
  values?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = React.memo(({
  template, values, className, style,
}) => {
  const html = useMemo(() => getCachedPreview(template, values), [template, values]);
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
});

TemplatePreview.displayName = 'TemplatePreview';
