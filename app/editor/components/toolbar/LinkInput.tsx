'use client';

import React from 'react';
import { ExternalLink, Unlink } from 'lucide-react';

interface LinkInputProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  linkUrl: string;
  onUrlChange: (url: string) => void;
  onApply: (url: string) => void;
  onClose: () => void;
  hasLink: boolean;
  onRemoveLink: () => void;
}

export const LinkInput: React.FC<LinkInputProps> = ({
  menuRef, menuPos, inputRef, linkUrl, onUrlChange, onApply, onClose, hasLink, onRemoveLink,
}) => (
  <div
    ref={menuRef}
    className="fixed z-51 bg-white shadow-xl border border-gray-200 rounded-lg p-3 w-75"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => { e.stopPropagation(); }}
  >
    <div className="text-xs font-medium text-gray-500 mb-2">Link externo</div>
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="url"
        className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        placeholder="https://exemplo.com"
        value={linkUrl}
        onChange={e => onUrlChange(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter' && linkUrl.trim()) {
            e.preventDefault();
            onApply(linkUrl.trim());
          }
          if (e.key === 'Escape') {
            onClose();
          }
        }}
        onPaste={e => e.stopPropagation()}
      />
      <button
        className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-40 transition-colors"
        disabled={!linkUrl.trim()}
        onClick={() => onApply(linkUrl.trim())}
      >
        <ExternalLink size={14} />
      </button>
    </div>
    {hasLink && (
      <button
        className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
        onClick={onRemoveLink}
      >
        <Unlink size={12} />
        Remover link
      </button>
    )}
  </div>
);
