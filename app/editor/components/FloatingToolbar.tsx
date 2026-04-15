'use client';

/* eslint-disable react-hooks/refs --
 *
 * The `ui` object returned by `useFloatingToolbar` mixes React refs and
 * plain state. The react-hooks/refs lint rule inspects the TYPE of `ui`,
 * spots its ref members and then flags every property access as a ref
 * access — most of which are false positives (sizeOpen, colorOpen, linkUrl,
 * etc. are plain state, not refs). Disabling file-wide is cleaner than
 * papering over every single prop with a localized comment.
 */

/**
 * FloatingToolbar — the contextual bubble that appears above a text
 * selection. Consumes the shared `commands` object (from `useFormatCommands`,
 * hoisted in `NotionEditor`) for all formatting logic, and `useFloatingToolbar`
 * for its own visibility/position/submenu state.
 *
 * Rendering is two-part:
 *   1. The floating bar itself (bold, italic, font, size, color, alignment,
 *      link, comment, internal ref).
 *   2. The submenus that each button opens — positioned absolutely relative
 *      to the bar.
 */

import React from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  Link, Palette, Type, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  BookmarkIcon, MessageSquarePlus,
} from 'lucide-react';
import { WEIGHT_LABELS } from '../fonts';
import { BlockData } from '../types';
import { modKey, shiftKey } from '../constants';
import { useFonts } from './FontLoader';
import { useFloatingToolbar } from '../hooks/useFloatingToolbar';
import { useFormatCommandsContext } from '../hooks/useFormatCommands';
import { Tooltip } from './toolbar/Tooltip';
import { ColorPicker } from './toolbar/ColorPicker';
import { FontPicker } from './toolbar/FontPicker';
import { WeightPicker } from './toolbar/WeightPicker';
import { SizePicker } from './toolbar/SizePicker';
import { AlignmentPicker } from './toolbar/AlignmentPicker';
import { LinkInput } from './toolbar/LinkInput';
import { RefPicker } from './toolbar/RefPicker';

// --- Formatting action buttons (bold / italic / underline / strike) ---
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

interface FloatingToolbarProps {
  blocks?: BlockData[];
  onAddComment?: (blockId: string, selectedText: string, range: Range) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  blocks, onAddComment, scrollRef,
}) => {
  // Format commands come from the shared context — see FormatCommandsProvider.
  const commands = useFormatCommandsContext();
  const { allFonts, customFonts } = useFonts();
  const ui = useFloatingToolbar({ commands, scrollRef });

  const currentFontEntry = allFonts.find(f => f.family === commands.currentFont);
  const availableWeights = currentFontEntry?.availableWeights;
  const currentWeightLabel = WEIGHT_LABELS[commands.currentWeight] || String(commands.currentWeight);

  if (!ui.visible) return null;

  return (
    <>
      {/* Main floating bar */}
      <div
        ref={ui.toolbarRef}
        className="absolute z-50 bg-white shadow-lg border border-gray-200 rounded-lg p-1 flex items-center gap-0.5"
        style={{ left: ui.position.left, top: ui.position.top }}
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      >
        {/* Font */}
        <Tooltip label="Fonte" shortcut="">
          <button
            className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 max-w-25 ${ui.fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { ui.setFontOpen(!ui.fontOpen); ui.closeSubmenusExcept('font'); }}
          >
            <Type size={14} className="shrink-0 relative -top-[0.25px]" />
            <span className="truncate">
              {commands.currentFont
                ? allFonts.find(f => f.family === commands.currentFont)?.name || 'Fonte'
                : 'Fonte'}
            </span>
            <ChevronDown size={10} />
          </button>
        </Tooltip>

        {/* Weight (only fonts with multiple weights) */}
        {availableWeights && availableWeights.length > 1 && (
          <Tooltip label="Peso" shortcut="">
            <button
              className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 ${ui.weightOpen ? 'bg-gray-100' : ''}`}
              onClick={() => { ui.setWeightOpen(!ui.weightOpen); ui.closeSubmenusExcept('weight'); }}
            >
              <span className="truncate" style={{ fontWeight: commands.currentWeight }}>
                {currentWeightLabel}
              </span>
              <ChevronDown size={10} />
            </button>
          </Tooltip>
        )}

        {/* Font size */}
        <Tooltip label="Tamanho" shortcut="">
          <button
            className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 ${ui.sizeOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { ui.setSizeOpen(!ui.sizeOpen); ui.closeSubmenusExcept('size'); }}
          >
            <span className="truncate tabular-nums">{commands.currentFontSize}</span>
            <ChevronDown size={10} />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Color */}
        <Tooltip label="Cor" shortcut="">
          <button
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${ui.colorOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { ui.setColorOpen(!ui.colorOpen); ui.closeSubmenusExcept('color'); }}
          >
            <Palette size={16} className="text-gray-600" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Bold / Italic / Underline / Strikethrough */}
        {FORMAT_ACTIONS.map(action => (
          <Tooltip key={action.id} label={action.label} shortcut={action.shortcut}>
            <button
              className={`p-1.5 rounded transition-colors ${
                commands.activeFormats.has(action.id)
                  ? 'bg-gray-200 text-gray-900'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              onClick={() => commands.applyFormat(action.command)}
            >
              {action.icon}
            </button>
          </Tooltip>
        ))}

        {/* Alignment dropdown — only when we can actually update blocks */}
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <Tooltip label="Alinhamento" shortcut="">
          <button
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 ${ui.alignOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { ui.setAlignOpen(!ui.alignOpen); ui.closeSubmenusExcept('align'); }}
          >
            {commands.currentAlign === 'center' ? <AlignCenter size={16} className="text-gray-600" /> :
             commands.currentAlign === 'right' ? <AlignRight size={16} className="text-gray-600" /> :
             commands.currentAlign === 'justify' ? <AlignJustify size={16} className="text-gray-600" /> :
             <AlignLeft size={16} className="text-gray-600" />}
            <ChevronDown size={10} className="text-gray-400" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Link */}
        <Tooltip label="Link externo" shortcut={`${modKey}+K`}>
          <button
            className={`p-1.5 rounded transition-colors ${
              commands.activeFormats.has('link')
                ? 'bg-gray-200 text-gray-900'
                : ui.linkOpen ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
            onClick={() => {
              if (commands.activeFormats.has('link') && commands.currentLink) {
                ui.setLinkUrl(commands.currentLink.href);
              } else {
                ui.setLinkUrl('');
              }
              ui.setLinkOpen(!ui.linkOpen);
              ui.closeSubmenusExcept('link');
            }}
          >
            <Link size={16} />
          </button>
        </Tooltip>

        {/* Internal reference */}
        {blocks && blocks.length > 0 && (
          <Tooltip label="Referência interna" shortcut="">
            <button
              className={`p-1.5 rounded transition-colors ${
                ui.refOpen ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-100 text-gray-600'
              }`}
              onClick={() => {
                ui.setRefSearch('');
                ui.setRefOpen(!ui.refOpen);
                ui.closeSubmenusExcept('ref');
              }}
            >
              <BookmarkIcon size={16} />
            </button>
          </Tooltip>
        )}

        {/* Comment */}
        {onAddComment && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            <Tooltip label="Comentar" shortcut="">
              <button
                className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
                onClick={() => {
                  commands.restoreSelection();
                  const sel = window.getSelection();
                  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
                  const blockId = commands.getSelectedBlockId();
                  if (!blockId) return;
                  const text = sel.toString().trim();
                  if (!text) return;
                  const range = sel.getRangeAt(0).cloneRange();
                  onAddComment(blockId, text, range);
                }}
              >
                <MessageSquarePlus size={16} />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Submenus */}
      {ui.colorOpen && (
        <ColorPicker
          menuRef={ui.colorMenuRef}
          menuPos={ui.colorMenuPos}
          currentTextColor={commands.currentTextColor}
          currentBgColor={commands.currentBgColor}
          onTextColor={c => { commands.applyTextColor(c); ui.setColorOpen(false); }}
          onBgColor={c => { commands.applyBgColor(c); ui.setColorOpen(false); }}
        />
      )}

      {ui.fontOpen && (
        <FontPicker
          menuRef={ui.fontMenuRef}
          menuPos={ui.fontMenuPos}
          allFonts={allFonts}
          customFonts={customFonts}
          currentFont={commands.currentFont}
          onSelect={f => { commands.applyFont(f); ui.setFontOpen(false); }}
        />
      )}

      {ui.weightOpen && availableWeights && availableWeights.length > 1 && (
        <WeightPicker
          menuRef={ui.weightMenuRef}
          menuPos={ui.weightMenuPos}
          availableWeights={availableWeights}
          currentWeight={commands.currentWeight}
          currentFont={commands.currentFont}
          onSelect={w => { commands.applyWeight(w); ui.setWeightOpen(false); }}
        />
      )}

      {ui.sizeOpen && (
        <SizePicker
          menuRef={ui.sizeMenuRef}
          menuPos={ui.sizeMenuPos}
          currentSize={commands.currentFontSize}
          onSelect={s => { commands.applyFontSize(s); ui.setSizeOpen(false); }}
        />
      )}

      {ui.alignOpen && (
        <AlignmentPicker
          menuRef={ui.alignMenuRef}
          menuPos={ui.alignMenuPos}
          currentAlign={commands.currentAlign}
          onSelect={a => { commands.applyAlignment(a); ui.setAlignOpen(false); }}
        />
      )}

      {ui.linkOpen && (
        <LinkInput
          menuRef={ui.linkMenuRef}
          menuPos={ui.linkMenuPos}
          inputRef={ui.linkInputRef}
          linkUrl={ui.linkUrl}
          onUrlChange={ui.setLinkUrl}
          onApply={u => { commands.applyLink(u); ui.setLinkOpen(false); ui.setLinkUrl(''); }}
          onClose={() => ui.setLinkOpen(false)}
          hasLink={commands.activeFormats.has('link') && !!commands.currentLink}
          onRemoveLink={() => { commands.removeLink(); ui.setLinkOpen(false); }}
        />
      )}

      {ui.refOpen && blocks && (
        <RefPicker
          menuRef={ui.refMenuRef}
          menuPos={ui.refMenuPos}
          inputRef={ui.refInputRef}
          blocks={blocks}
          refSearch={ui.refSearch}
          onSearchChange={ui.setRefSearch}
          onSelect={id => { commands.applyRef(id); ui.setRefOpen(false); ui.setRefSearch(''); }}
          onClose={() => ui.setRefOpen(false)}
        />
      )}
    </>
  );
};
