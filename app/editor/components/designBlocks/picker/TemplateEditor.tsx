'use client';

// ---------------------------------------------------------------------------
// TemplateEditor — JSON editor + live preview, used for create/edit
// ---------------------------------------------------------------------------
// Stacks vertically on mobile (single column), side-by-side on md+.
// ---------------------------------------------------------------------------

import React, { useCallback, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import type { LibraryTemplate, TemplateInput } from '../../../designLibrary';
import { TemplatePreview } from '../TemplatePreview';

interface TemplateEditorProps {
  existing?: LibraryTemplate;
  onSave: (input: TemplateInput) => Promise<void>;
  onCancel: () => void;
}

interface ParsedTemplate {
  name: string;
  html: string;
  defaults: Record<string, string>;
  autonumber?: 'heading' | 'subheading';
}

/** Single source of truth for parsing+validating the JSON editor content.
 *  Returns either a valid input shape or an error message. */
function parseTemplateJson(json: string): { ok: true; value: ParsedTemplate } | { ok: false; error: string } {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `JSON inválido: ${e.message}` : 'JSON inválido' };
  }
  if (!obj.name || typeof obj.name !== 'string') {
    return { ok: false, error: 'O campo "name" é obrigatório' };
  }
  if (!obj.html || typeof obj.html !== 'string') {
    return { ok: false, error: 'O campo "html" é obrigatório' };
  }
  if (obj.defaults && typeof obj.defaults !== 'object') {
    return { ok: false, error: '"defaults" deve ser um objeto' };
  }
  return {
    ok: true,
    value: {
      name: obj.name,
      html: obj.html,
      defaults: (obj.defaults as Record<string, string> | undefined) ?? {},
      autonumber: (obj.autonumber as 'heading' | 'subheading' | null | undefined) ?? undefined,
    },
  };
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ existing, onSave, onCancel }) => {
  const [json, setJson] = useState(() =>
    existing
      ? JSON.stringify(
          { name: existing.name, html: existing.html, defaults: existing.defaults, autonumber: existing.autonumber ?? null },
          null,
          2,
        )
      : `{
  "name": "Meu novo bloco",
  "html": "<div class=\\"p-4 rounded-xl bg-purple-100\\"><p data-editable=\\"body\\"></p></div>",
  "defaults": { "body": "Texto padrão" },
  "autonumber": null
}`
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Parsed once per JSON edit; both the preview and Save use the result.
  const parsedResult = useMemo(() => parseTemplateJson(json), [json]);
  const parsed = parsedResult.ok ? parsedResult.value : null;

  const previewTemplate: LibraryTemplate | null = useMemo(() => {
    if (!parsed) return null;
    return {
      id: existing?.id ?? 'preview',
      name: parsed.name,
      html: parsed.html,
      defaults: parsed.defaults,
      autonumber: parsed.autonumber,
      workspaceId: existing?.workspaceId ?? '',
      documentId: existing?.documentId ?? '',
    };
  }, [parsed, existing]);

  const handleSave = useCallback(async () => {
    if (!parsedResult.ok) {
      setError(parsedResult.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: existing?.id,
        name: parsedResult.value.name,
        html: parsedResult.value.html,
        defaults: parsedResult.value.defaults,
        autonumber: parsedResult.value.autonumber,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }, [parsedResult, existing, onSave]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-gray-100 shrink-0">
        <span className="text-sm font-semibold text-gray-800">{existing ? 'Editar bloco' : 'Novo bloco'}</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!parsed || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Split: JSON / preview */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 px-3 sm:px-5 py-3 sm:py-4 overflow-y-auto md:overflow-hidden">
        <div className="flex flex-col min-h-50 md:min-h-0">
          <label className="text-[11px] text-gray-500 mb-1">JSON do bloco</label>
          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full text-xs font-mono border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 resize-none"
          />
          {(error || (!parsed && parsedResult && !parsedResult.ok)) && (
            <div className="text-xs text-red-500 mt-1">
              {error ?? (parsedResult.ok ? '' : parsedResult.error)}
            </div>
          )}
        </div>
        <div className="flex flex-col min-h-50 md:min-h-0">
          <label className="text-[11px] text-gray-500 mb-1">Preview</label>
          <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-gray-50 overflow-auto">
            {previewTemplate ? (
              <TemplatePreview template={previewTemplate} />
            ) : (
              <div className="text-xs text-gray-400 italic">JSON inválido — o preview aparece quando estiver correto.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
