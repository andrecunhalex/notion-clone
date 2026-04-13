// ---------------------------------------------------------------------------
// Template HTML sanitization
// ---------------------------------------------------------------------------
// Template HTML comes from user input (JSON editor, Figma export, etc.) and
// is later rendered via `dangerouslySetInnerHTML` both in previews and in
// actual design blocks. Without sanitization this is a trivial XSS vector
// (any author could inject <script> or javascript: hrefs into the library
// and attack anyone viewing the document).
//
// We use `isomorphic-dompurify` because the create/update path can run on
// both client (Supabase from the browser) and server (future API routes /
// import flows). Sanitization happens at the WRITE boundary — once clean
// HTML is in the library, rendering code can trust it.
//
// The default DOMPurify config strips our custom data attributes, so we
// explicitly allow `data-editable`, `data-swappable`, `data-autonumber` via
// ADD_ATTR. We also allow inline styles (ADD_ATTR: 'style') because Figma
// exports rely heavily on inline styling — DOMPurify still sanitizes
// expressions and url() payloads within them.
// ---------------------------------------------------------------------------

import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_ATTR = [
  // Our template markers — rendering code looks these up by selector
  'data-editable',
  'data-swappable',
  'data-autonumber',
  // Common layout/style
  'class',
  'style',
  // Images (rendered as <img>)
  'src',
  'alt',
  'width',
  'height',
  // Anchors
  'href',
  'target',
  'rel',
  // Generic
  'role',
  'aria-label',
  'title',
];

/**
 * Sanitize a template HTML string. Safe to call on already-clean input —
 * DOMPurify is idempotent. Returns a string with scripts, event handlers,
 * javascript: URLs and similar payloads removed.
 */
export function sanitizeTemplateHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ALLOWED_ATTR,
    // Keep the root element(s) as a fragment string, without wrapping
    RETURN_TRUSTED_TYPE: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}
