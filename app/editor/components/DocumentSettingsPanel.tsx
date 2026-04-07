'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { X, ChevronUp, ChevronDown, Upload, EyeOff, ImageIcon } from 'lucide-react';
import { DocumentPageSettings, PageBackground, PAGE_PRESETS } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentSettingsPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  pageSettings: Required<DocumentPageSettings>;
  pageBackground?: PageBackground;
  totalPages: number;
  onPageSettingsChange: (settings: DocumentPageSettings) => void;
  onPageBackgroundChange: (bg: PageBackground | undefined) => void;
  sectionNavPages?: boolean | number[];
  onSectionNavPagesChange: (pages: boolean | number[]) => void;
  hasSections: boolean;
  uploadImage?: (file: File) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActivePreset(width: number, height: number): string | null {
  return PAGE_PRESETS.find(p => p.width === width && p.height === height)?.name || null;
}

// ---------------------------------------------------------------------------
// Numeric input field (stacked: label on top)
// ---------------------------------------------------------------------------

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}> = ({ label, value, onChange, min = 0, max = 9999, suffix = 'px' }) => (
  <div>
    <span className="text-xs text-gray-400 mb-1 block">{label}</span>
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-purple-400 tabular-nums"
        min={min}
        max={max}
      />
      <span className="text-xs text-gray-400 shrink-0">{suffix}</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Background image section
// ---------------------------------------------------------------------------

const BackgroundSection: React.FC<{
  pageBackground?: PageBackground;
  totalPages: number;
  /** Page aspect ratio (width / height) for preview proportions */
  pageAspect: number;
  onChange: (bg: PageBackground | undefined) => void;
  uploadImage?: (file: File) => Promise<string | null>;
}> = ({ pageBackground, totalPages, pageAspect, onChange, uploadImage }) => {
  const defaultFileRef = useRef<HTMLInputElement>(null);
  const pageFileRef = useRef<HTMLInputElement>(null);
  const [uploadingPage, setUploadingPage] = useState<number | null>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, pageIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let url: string;
    if (uploadImage) {
      const result = await uploadImage(file);
      url = result || URL.createObjectURL(file);
    } else {
      url = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    if (pageIndex !== undefined) {
      onChange({ ...pageBackground, overrides: { ...pageBackground?.overrides, [pageIndex]: url } });
    } else {
      onChange({ ...pageBackground, defaultImage: url });
    }
    e.target.value = '';
    setUploadingPage(null);
  }, [pageBackground, onChange, uploadImage]);

  const clearDefault = useCallback(() => {
    if (!pageBackground) return;
    const { defaultImage, ...rest } = pageBackground;
    const hasOverrides = rest.overrides && Object.keys(rest.overrides).length > 0;
    onChange(hasOverrides ? rest : undefined);
  }, [pageBackground, onChange]);

  const togglePageOverride = useCallback((pageIndex: number) => {
    const overrides = { ...pageBackground?.overrides };
    if (pageIndex in overrides) {
      delete overrides[pageIndex];
    } else {
      overrides[pageIndex] = null;
    }
    onChange({
      ...pageBackground,
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });
  }, [pageBackground, onChange]);

  const defaultImg = pageBackground?.defaultImage;

  // Aspect ratio style for page-proportional previews
  const aspectStyle = useMemo(() => ({ aspectRatio: `${pageAspect}` }), [pageAspect]);

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Imagem de fundo</h4>

      {/* Default image — page-proportional preview */}
      <div className="mb-3">
        <span className="text-xs text-gray-400 mb-1.5 block">Padrao (todas as paginas)</span>
        <div
          className="relative rounded-lg border-2 border-dashed border-gray-200 overflow-hidden cursor-pointer hover:border-purple-300 transition-colors group"
          style={{ height: 100, width: 100 * pageAspect }}
          onClick={() => defaultFileRef.current?.click()}
        >
          {defaultImg ? (
            <>
              <img src={defaultImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <button
                onClick={e => { e.stopPropagation(); clearDefault(); }}
                className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <Upload size={18} className="mb-1" />
              <span className="text-xs">Escolher imagem</span>
            </div>
          )}
        </div>
      </div>

      {/* Per-page overrides */}
      {totalPages > 1 && (
        <div>
          <span className="text-xs text-gray-400 mb-1.5 block">Imagem por pagina</span>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: totalPages }, (_, i) => {
              const override = pageBackground?.overrides?.[i];
              const hasOverride = pageBackground?.overrides !== undefined && i in (pageBackground.overrides || {});
              const displayImg = hasOverride ? (override || undefined) : defaultImg;
              const isDisabled = hasOverride && override === null;

              return (
                <div key={i} className="relative group">
                  <div
                    className={`w-full rounded border overflow-hidden transition-all cursor-pointer ${
                      isDisabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 hover:border-purple-300'
                    }`}
                    style={aspectStyle}
                    onClick={() => {
                      if (!isDisabled) {
                        setUploadingPage(i);
                        pageFileRef.current?.click();
                      }
                    }}
                  >
                    {displayImg && !isDisabled ? (
                      <img src={displayImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isDisabled
                          ? <EyeOff size={12} className="text-gray-300" />
                          : <ImageIcon size={12} className="text-gray-300" />
                        }
                      </div>
                    )}
                  </div>
                  {/* Page number badge */}
                  <span className="absolute -top-1 -left-1 bg-gray-700 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {i + 1}
                  </span>
                  {/* Eye-off toggle — small corner button */}
                  <button
                    onClick={e => { e.stopPropagation(); togglePageOverride(i); }}
                    className={`absolute -bottom-1 -right-1 p-0.5 rounded-full transition-colors ${
                      isDisabled
                        ? 'bg-red-100 text-red-500 hover:bg-red-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 opacity-0 group-hover:opacity-100'
                    }`}
                    title={isDisabled ? 'Ativar imagem' : 'Ocultar imagem nesta pagina'}
                  >
                    <EyeOff size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <input ref={defaultFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e)} />
      <input ref={pageFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, uploadingPage ?? undefined)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section nav visibility — toggle + per-page grid (always visible when on)
// ---------------------------------------------------------------------------

const SectionNavSection: React.FC<{
  sectionNavPages?: boolean | number[];
  totalPages: number;
  onChange: (pages: boolean | number[]) => void;
}> = ({ sectionNavPages, totalPages, onChange }) => {
  // Normalize: undefined/true = all enabled, false = all disabled, number[] = specific
  const isAllEnabled = sectionNavPages === undefined || sectionNavPages === true;
  const isAllDisabled = sectionNavPages === false;
  const enabledSet = useMemo<Set<number>>(() => {
    if (isAllEnabled) return new Set(Array.from({ length: totalPages }, (_, i) => i));
    if (isAllDisabled) return new Set();
    return new Set(sectionNavPages as number[]);
  }, [sectionNavPages, isAllEnabled, isAllDisabled, totalPages]);

  const togglePage = useCallback((pageIndex: number) => {
    const next = new Set(enabledSet);
    if (next.has(pageIndex)) {
      next.delete(pageIndex);
    } else {
      next.add(pageIndex);
    }
    // All on → true, none → false, partial → array
    if (next.size === totalPages) onChange(true);
    else if (next.size === 0) onChange(false);
    else onChange(Array.from(next).sort((a, b) => a - b));
  }, [enabledSet, totalPages, onChange]);

  const allOn = enabledSet.size === totalPages;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Botoes de secao</h4>

      {/* Master toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">Exibir nas paginas</span>
        <button
          onClick={() => onChange(allOn ? false : true)}
          className={`relative w-9 h-5 rounded-full transition-colors ${allOn ? 'bg-purple-500' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allOn ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Per-page grid — always visible when there are multiple pages */}
      {totalPages > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => {
            const isOn = enabledSet.has(i);
            return (
              <button
                key={i}
                onClick={() => togglePage(i)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  isOn
                    ? 'bg-purple-100 text-purple-700 border border-purple-300'
                    : 'bg-gray-50 text-gray-400 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Settings content (shared between desktop and mobile)
// ---------------------------------------------------------------------------

const SettingsContent: React.FC<{
  pageSettings: Required<DocumentPageSettings>;
  pageBackground?: PageBackground;
  totalPages: number;
  onPageSettingsChange: (s: DocumentPageSettings) => void;
  onPageBackgroundChange: (bg: PageBackground | undefined) => void;
  sectionNavPages?: boolean | number[];
  onSectionNavPagesChange: (pages: boolean | number[]) => void;
  hasSections: boolean;
  uploadImage?: (file: File) => Promise<string | null>;
}> = ({ pageSettings, pageBackground, totalPages, onPageSettingsChange, onPageBackgroundChange, sectionNavPages, onSectionNavPagesChange, hasSections, uploadImage }) => {
  const activePreset = getActivePreset(pageSettings.width, pageSettings.height);
  const [isCustom, setIsCustom] = useState(!activePreset);
  const pageAspect = pageSettings.width / pageSettings.height;

  const updatePage = useCallback((updates: Partial<DocumentPageSettings>) => {
    onPageSettingsChange({ ...pageSettings, ...updates });
  }, [pageSettings, onPageSettingsChange]);

  return (
    <div className="space-y-6">
      {/* Page format */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Formato da pagina</h4>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PAGE_PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => { updatePage({ width: preset.width, height: preset.height }); setIsCustom(false); }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                !isCustom && activePreset === preset.name
                  ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {preset.name}
            </button>
          ))}
          <button
            onClick={() => setIsCustom(true)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              isCustom
                ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            Personalizado
          </button>
        </div>
        {isCustom && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Largura" value={pageSettings.width} onChange={v => updatePage({ width: v })} min={200} max={2000} />
            <NumberField label="Altura" value={pageSettings.height} onChange={v => updatePage({ height: v })} min={200} max={3000} />
          </div>
        )}
      </div>

      {/* Margins — stacked vertically */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Margens</h4>
        <div className="space-y-2.5">
          <NumberField label="Superior" value={pageSettings.paddingTop} onChange={v => updatePage({ paddingTop: v })} max={500} />
          <NumberField label="Inferior" value={pageSettings.paddingBottom} onChange={v => updatePage({ paddingBottom: v })} max={500} />
          <NumberField label="Esquerda" value={pageSettings.paddingLeft} onChange={v => updatePage({ paddingLeft: v })} max={400} />
          <NumberField label="Direita" value={pageSettings.paddingRight} onChange={v => updatePage({ paddingRight: v })} max={400} />
        </div>
      </div>

      {/* Background image */}
      <BackgroundSection
        pageBackground={pageBackground}
        totalPages={totalPages}
        pageAspect={pageAspect}
        onChange={onPageBackgroundChange}
        uploadImage={uploadImage}
      />

      {/* Section nav */}
      {hasSections && (
        <SectionNavSection
          sectionNavPages={sectionNavPages}
          totalPages={totalPages}
          onChange={onSectionNavPagesChange}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel: desktop floating card + mobile bottom sheet
// ---------------------------------------------------------------------------

export const DocumentSettingsPanel: React.FC<DocumentSettingsPanelProps> = ({
  isOpen, onToggle, pageSettings, pageBackground, totalPages,
  onPageSettingsChange, onPageBackgroundChange,
  sectionNavPages, onSectionNavPagesChange, hasSections,
  uploadImage,
}) => {
  return (
    <>
      {/* Desktop: floating card */}
      <div
        data-editor-toolbar
        className="hidden lg:block fixed right-5 top-20 z-50"
        style={{ maxHeight: 'calc(100vh - 80px)' }}
      >
        <div
          className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 80px)', width: 280 }}
        >
          <button
            onClick={onToggle}
            className="flex items-center justify-between px-4 py-3.5 shrink-0 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-base font-semibold text-gray-800">Configuracoes</span>
            {isOpen ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
          </button>
          {isOpen && (
            <div className="overflow-y-auto border-t border-gray-100 px-4 py-4">
              <SettingsContent
                pageSettings={pageSettings}
                pageBackground={pageBackground}
                totalPages={totalPages}
                onPageSettingsChange={onPageSettingsChange}
                onPageBackgroundChange={onPageBackgroundChange}
                sectionNavPages={sectionNavPages}
                onSectionNavPagesChange={onSectionNavPagesChange}
                hasSections={hasSections}
                uploadImage={uploadImage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={`lg:hidden fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onToggle}
      />
      <div
        data-editor-toolbar
        className={`lg:hidden fixed left-0 right-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-2xl shadow-xl max-h-[75vh] flex flex-col">
          <div className="shrink-0 pt-3 pb-2 px-5">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-800">Configuracoes</span>
              <button onClick={onToggle} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto border-t border-gray-100 px-5 py-4 pb-safe">
            <SettingsContent
              pageSettings={pageSettings}
              pageBackground={pageBackground}
              totalPages={totalPages}
              onPageSettingsChange={onPageSettingsChange}
              onPageBackgroundChange={onPageBackgroundChange}
              sectionNavPages={sectionNavPages}
              onSectionNavPagesChange={onSectionNavPagesChange}
              hasSections={hasSections}
              uploadImage={uploadImage}
            />
          </div>
        </div>
      </div>
    </>
  );
};
