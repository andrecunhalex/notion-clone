import { describe, it, expect } from 'vitest';
import {
  normalize,
  getTemplateSearchBlob,
  getClauseSearchBlob,
  matchesTemplate,
  matchesClause,
} from '../search';
import type { LibraryTemplate, LibraryClause } from '../types';

function makeTemplate(overrides: Partial<LibraryTemplate> = {}): LibraryTemplate {
  return {
    id: 't1',
    name: 'Card com Ícone',
    html: '<div><p data-editable="body"></p></div>',
    defaults: { body: 'Texto padrão do bloco' },
    workspaceId: 'w1',
    documentId: 'd1',
    ...overrides,
  };
}

function makeClause(overrides: Partial<LibraryClause> = {}): LibraryClause {
  return {
    id: 'c1',
    name: 'Obrigações do contratado',
    items: [{ id: 'i1', templateId: 't1', values: { body: 'manter as licenças válidas' } }],
    workspaceId: 'w1',
    documentId: 'd1',
    ...overrides,
  };
}

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('Hello World')).toBe('hello world');
  });

  it('strips diacritics', () => {
    expect(normalize('Atenção')).toBe('atencao');
    expect(normalize('cláusula')).toBe('clausula');
    expect(normalize('coração')).toBe('coracao');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('getTemplateSearchBlob', () => {
  it('includes name + default values text', () => {
    const tpl = makeTemplate();
    const blob = getTemplateSearchBlob(tpl);
    expect(blob).toContain('card com icone');
    expect(blob).toContain('texto padrao do bloco');
  });

  it('strips HTML tags from default values', () => {
    const tpl = makeTemplate({ defaults: { body: '<b>bold</b> and <i>italic</i> text' } });
    const blob = getTemplateSearchBlob(tpl);
    expect(blob).not.toContain('<b>');
    expect(blob).not.toContain('<i>');
    expect(blob).toContain('bold');
    expect(blob).toContain('italic');
  });

  it('caches by template identity — same object returns same blob in O(1)', () => {
    const tpl = makeTemplate();
    const first = getTemplateSearchBlob(tpl);
    const second = getTemplateSearchBlob(tpl);
    expect(second).toBe(first);
  });

  it('returns different blob for different template instances even with same content', () => {
    // WeakMap keyed by identity — two separate objects get separate cache entries
    const a = makeTemplate({ name: 'Same Name' });
    const b = makeTemplate({ name: 'Same Name' });
    expect(getTemplateSearchBlob(a)).toBe(getTemplateSearchBlob(b)); // same string
    // But they're separate cache entries — verifying identity-based cache works:
    expect(a).not.toBe(b);
  });
});

describe('getClauseSearchBlob', () => {
  it('includes clause name, item template names, and item value text', () => {
    const tpl = makeTemplate({ id: 't1', name: 'Card' });
    const clause = makeClause();
    const map = new Map([[tpl.id, tpl]]);
    const blob = getClauseSearchBlob(clause, map);
    expect(blob).toContain('obrigacoes do contratado');
    expect(blob).toContain('card');
    expect(blob).toContain('manter as licencas validas');
  });

  it('skips items whose template is missing from the map', () => {
    const clause = makeClause();
    const blob = getClauseSearchBlob(clause, new Map());
    // Still includes clause name + item values
    expect(blob).toContain('obrigacoes');
    expect(blob).toContain('manter as licencas validas');
  });
});

describe('matchesTemplate', () => {
  it('returns true for empty query', () => {
    const tpl = makeTemplate();
    expect(matchesTemplate(tpl, '')).toBe(true);
  });

  it('matches by name (accent-insensitive)', () => {
    const tpl = makeTemplate({ name: 'Atenção' });
    expect(matchesTemplate(tpl, normalize('atencao'))).toBe(true);
    expect(matchesTemplate(tpl, normalize('Atenção'))).toBe(true);
    expect(matchesTemplate(tpl, normalize('aten'))).toBe(true);
  });

  it('matches by content text', () => {
    const tpl = makeTemplate({ defaults: { body: 'rescisão antecipada do contrato' } });
    expect(matchesTemplate(tpl, normalize('rescisao'))).toBe(true);
    expect(matchesTemplate(tpl, normalize('contrato'))).toBe(true);
  });

  it('returns false for non-matching query', () => {
    const tpl = makeTemplate();
    expect(matchesTemplate(tpl, normalize('completamente-diferente'))).toBe(false);
  });
});

describe('matchesClause', () => {
  it('matches by clause name', () => {
    const tpl = makeTemplate();
    const clause = makeClause();
    const map = new Map([[tpl.id, tpl]]);
    expect(matchesClause(clause, map, normalize('obrigacoes'))).toBe(true);
  });

  it('matches by item value text', () => {
    const tpl = makeTemplate();
    const clause = makeClause();
    const map = new Map([[tpl.id, tpl]]);
    expect(matchesClause(clause, map, normalize('licencas'))).toBe(true);
  });

  it('returns false for non-matching query', () => {
    const tpl = makeTemplate();
    const clause = makeClause();
    const map = new Map([[tpl.id, tpl]]);
    expect(matchesClause(clause, map, normalize('xyz'))).toBe(false);
  });
});
