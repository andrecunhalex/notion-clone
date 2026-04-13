import type { DesignBlockTemplate } from './registry';

/**
 * Build a static (non-interactive) preview HTML string from a template.
 * Injects default values into `data-editable` and `data-swappable` slots and
 * strips the marker attributes so nothing in the preview is clickable.
 * Used by pickers and management modals.
 */
export function buildPreviewHtml(tpl: DesignBlockTemplate, values?: Record<string, string>): string {
  if (typeof document === 'undefined') return '';
  const div = document.createElement('div');
  div.innerHTML = tpl.html;

  div.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
    const key = el.getAttribute('data-editable')!;
    el.innerHTML = values?.[key] ?? tpl.defaults[key] ?? '';
    el.removeAttribute('data-editable');
  });
  div.querySelectorAll<HTMLElement>('[data-swappable]').forEach(el => {
    const key = el.getAttribute('data-swappable')!;
    if (el.tagName === 'IMG') (el as HTMLImageElement).src = values?.[key] ?? tpl.defaults[key] ?? '';
    el.removeAttribute('data-swappable');
  });
  div.querySelectorAll<HTMLElement>('[data-autonumber]').forEach(el => {
    el.textContent = '1';
  });

  return div.innerHTML;
}
