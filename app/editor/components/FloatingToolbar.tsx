'use client';

import React from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  Link, Palette, Type, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  BookmarkIcon,
} from 'lucide-react';
import { WEIGHT_LABELS } from '../fonts';
import { BlockData } from '../types';
import { modKey, shiftKey } from '../constants';
import { useFonts } from './FontLoader';
import { useFloatingToolbar } from '../hooks/useFloatingToolbar';
import { Tooltip } from './toolbar/Tooltip';
import { ColorPicker } from './toolbar/ColorPicker';
import { FontPicker } from './toolbar/FontPicker';
import { WeightPicker } from './toolbar/WeightPicker';
import { AlignmentPicker } from './toolbar/AlignmentPicker';
import { LinkInput } from './toolbar/LinkInput';
import { RefPicker } from './toolbar/RefPicker';

// --- Formatting actions ---
interface FormatAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  command: string;
}

const FORMAT_ACTIONS: FormatAction[] = [
  { id: 'bold', icon: <Bold size={16} strokeWidth={2.5} />, label: 'Negrito', shortcut: `${modKey}+B`, command: 'bold' },
  { id: 'italic', icon: <Italic size={16} />, label: 'Itálico', shortcut: `${modKey}+I`, command: 'italic' },
  { id: 'underline', icon: <Underline size={16} />, label: 'Sublinhado', shortcut: `${modKey}+U`, command: 'underline' },
  { id: 'strikethrough', icon: <Strikethrough size={16} />, label: 'Tachado', shortcut: `${modKey}+${shiftKey}+X`, command: 'strikeThrough' },
];

// --- Main component ---
interface FloatingToolbarProps {
  documentFont?: string;
  blocks?: BlockData[];
  updateBlock?: (id: string, updates: Partial<BlockData>) => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ documentFont, blocks, updateBlock }) => {
  const { allFonts, customFonts } = useFonts();

  const toolbar = useFloatingToolbar({ documentFont, blocks, updateBlock, allFonts });

  const currentFontEntry = allFonts.find(f => f.family === toolbar.currentFont);
  const availableWeights = currentFontEntry?.availableWeights;
  const currentWeightLabel = WEIGHT_LABELS[toolbar.currentWeight] || String(toolbar.currentWeight);

  if (!toolbar.visible) return null;

  return (
    <>
      {/* Main toolbar */}
      <div
        ref={toolbar.toolbarRef}
        className="fixed z-50 bg-white shadow-lg border border-gray-200 rounded-lg p-1 flex items-center gap-0.5"
        style={{ left: toolbar.position.left, top: toolbar.position.top }}
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      >
        {/* Font button */}
        <Tooltip label="Fonte" shortcut="">
          <button
            className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 max-w-25 ${toolbar.fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { toolbar.setFontOpen(!toolbar.fontOpen); toolbar.closeSubmenusExcept('font'); }}
          >
            <Type size={14} className="shrink-0 relative -top-[0.25px]" />
            <span className="truncate">
              {toolbar.currentFont
                ? allFonts.find(f => f.family === toolbar.currentFont)?.name || 'Fonte'
                : 'Fonte'}
            </span>
            <ChevronDown size={10} />
          </button>
        </Tooltip>

        {/* Weight button */}
        {availableWeights && availableWeights.length > 1 && (
          <Tooltip label="Peso" shortcut="">
            <button
              className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 ${toolbar.weightOpen ? 'bg-gray-100' : ''}`}
              onClick={() => { toolbar.setWeightOpen(!toolbar.weightOpen); toolbar.closeSubmenusExcept('weight'); }}
            >
              <span className="truncate" style={{ fontWeight: toolbar.currentWeight }}>
                {currentWeightLabel}
              </span>
              <ChevronDown size={10} />
            </button>
          </Tooltip>
        )}

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Color button */}
        <Tooltip label="Cor" shortcut="">
          <button
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${toolbar.colorOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { toolbar.setColorOpen(!toolbar.colorOpen); toolbar.closeSubmenusExcept('color'); }}
          >
            <Palette size={16} className="text-gray-600" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Format buttons */}
        {FORMAT_ACTIONS.map(action => (
          <Tooltip key={action.id} label={action.label} shortcut={action.shortcut}>
            <button
              className={`p-1.5 rounded transition-colors ${
                toolbar.activeFormats.has(action.id)
                  ? 'bg-gray-200 text-gray-900'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              onClick={() => toolbar.applyFormat(action.command)}
            >
              {action.icon}
            </button>
          </Tooltip>
        ))}

        {/* Alignment dropdown */}
        {updateBlock && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            <Tooltip label="Alinhamento" shortcut="">
              <button
                className={`p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 ${toolbar.alignOpen ? 'bg-gray-100' : ''}`}
                onClick={() => { toolbar.setAlignOpen(!toolbar.alignOpen); toolbar.closeSubmenusExcept('align'); }}
              >
                {toolbar.currentAlign === 'center' ? <AlignCenter size={16} className="text-gray-600" /> :
                 toolbar.currentAlign === 'right' ? <AlignRight size={16} className="text-gray-600" /> :
                 toolbar.currentAlign === 'justify' ? <AlignJustify size={16} className="text-gray-600" /> :
                 <AlignLeft size={16} className="text-gray-600" />}
                <ChevronDown size={10} className="text-gray-400" />
              </button>
            </Tooltip>
          </>
        )}

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Link button */}
        <Tooltip label="Link externo" shortcut={`${modKey}+K`}>
          <button
            className={`p-1.5 rounded transition-colors ${
              toolbar.activeFormats.has('link')
                ? 'bg-gray-200 text-gray-900'
                : toolbar.linkOpen ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
            onClick={() => {
              if (toolbar.activeFormats.has('link') && toolbar.currentLink) {
                toolbar.setLinkUrl(toolbar.currentLink.href);
              } else {
                toolbar.setLinkUrl('');
              }
              toolbar.setLinkOpen(!toolbar.linkOpen);
              toolbar.closeSubmenusExcept('link');
            }}
          >
            <Link size={16} />
          </button>
        </Tooltip>

        {/* Internal reference button */}
        {blocks && blocks.length > 0 && (
          <Tooltip label="Referência interna" shortcut="">
            <button
              className={`p-1.5 rounded transition-colors ${
                toolbar.refOpen ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-100 text-gray-600'
              }`}
              onClick={() => {
                toolbar.setRefSearch('');
                toolbar.setRefOpen(!toolbar.refOpen);
                toolbar.closeSubmenusExcept('ref');
              }}
            >
              <BookmarkIcon size={16} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Submenus */}
      {toolbar.colorOpen && (
        <ColorPicker
          menuRef={toolbar.colorMenuRef}
          menuPos={toolbar.colorMenuPos}
          currentTextColor={toolbar.currentTextColor}
          currentBgColor={toolbar.currentBgColor}
          onTextColor={toolbar.applyTextColor}
          onBgColor={toolbar.applyBgColor}
        />
      )}

      {toolbar.fontOpen && (
        <FontPicker
          menuRef={toolbar.fontMenuRef}
          menuPos={toolbar.fontMenuPos}
          allFonts={allFonts}
          customFonts={customFonts}
          currentFont={toolbar.currentFont}
          onSelect={toolbar.applyFont}
        />
      )}

      {toolbar.weightOpen && availableWeights && availableWeights.length > 1 && (
        <WeightPicker
          menuRef={toolbar.weightMenuRef}
          menuPos={toolbar.weightMenuPos}
          availableWeights={availableWeights}
          currentWeight={toolbar.currentWeight}
          currentFont={toolbar.currentFont}
          onSelect={toolbar.applyWeight}
        />
      )}

      {toolbar.alignOpen && updateBlock && (
        <AlignmentPicker
          menuRef={toolbar.alignMenuRef}
          menuPos={toolbar.alignMenuPos}
          currentAlign={toolbar.currentAlign}
          onSelect={toolbar.applyAlignment}
        />
      )}

      {toolbar.linkOpen && (
        <LinkInput
          menuRef={toolbar.linkMenuRef}
          menuPos={toolbar.linkMenuPos}
          inputRef={toolbar.linkInputRef}
          linkUrl={toolbar.linkUrl}
          onUrlChange={toolbar.setLinkUrl}
          onApply={toolbar.applyLink}
          onClose={() => toolbar.setLinkOpen(false)}
          hasLink={toolbar.activeFormats.has('link') && !!toolbar.currentLink}
          onRemoveLink={toolbar.removeLink}
        />
      )}

      {toolbar.refOpen && blocks && (
        <RefPicker
          menuRef={toolbar.refMenuRef}
          menuPos={toolbar.refMenuPos}
          inputRef={toolbar.refInputRef}
          blocks={blocks}
          refSearch={toolbar.refSearch}
          onSearchChange={toolbar.setRefSearch}
          onSelect={toolbar.applyRef}
          onClose={() => toolbar.setRefOpen(false)}
        />
      )}
    </>
  );
};
