import { describe, it, expect } from 'vitest';
import { sanitizeTemplateHtml } from '../sanitizeTemplate';

describe('sanitizeTemplateHtml', () => {
  it('strips <script> tags entirely', () => {
    const dirty = '<div>safe <script>alert(1)</script></div>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('safe');
  });

  it('strips inline event handlers', () => {
    const dirty = '<div onclick="evil()">click</div>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('click');
  });

  it('strips javascript: in href', () => {
    // eslint-disable-next-line no-script-url
    const dirty = '<a href="javascript:alert(1)">link</a>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).not.toContain('javascript:');
  });

  it('strips <iframe>', () => {
    const dirty = '<div>safe</div><iframe src="https://evil.com"></iframe>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).not.toContain('iframe');
    expect(clean).toContain('safe');
  });

  it('preserves data-editable attributes', () => {
    const dirty = '<p data-editable="title">Title</p>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).toContain('data-editable="title"');
  });

  it('preserves data-swappable attributes', () => {
    const dirty = '<img data-swappable="icon" src="x.png" alt="i" />';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).toContain('data-swappable="icon"');
  });

  it('preserves data-autonumber attributes', () => {
    const dirty = '<span data-autonumber></span>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).toContain('data-autonumber');
  });

  it('preserves Tailwind classes', () => {
    const dirty = '<div class="bg-purple-500 rounded-xl p-4">x</div>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).toContain('class="bg-purple-500 rounded-xl p-4"');
  });

  it('preserves inline styles (Figma export pattern)', () => {
    const dirty = '<div style="color: #5026e9; padding: 20px">x</div>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).toContain('style');
    expect(clean).toContain('5026e9');
  });

  it('is idempotent — running twice produces the same output', () => {
    const dirty = '<div class="a"><script>x</script><p>safe</p></div>';
    const once = sanitizeTemplateHtml(dirty);
    const twice = sanitizeTemplateHtml(once);
    expect(twice).toBe(once);
  });

  it('handles empty input', () => {
    expect(sanitizeTemplateHtml('')).toBe('');
  });

  it('strips <form> and form controls', () => {
    const dirty = '<form><input type="text" /><button>x</button></form>';
    const clean = sanitizeTemplateHtml(dirty);
    expect(clean).not.toContain('<form');
    expect(clean).not.toContain('<input');
    expect(clean).not.toContain('<button');
  });
});
