'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, RotateCw, FileText, Scroll, ChevronDown, X, ZoomIn, ZoomOut, MoveHorizontal, MoreHorizontal, List, Clock } from 'lucide-react';
import { ViewMode } from '../types';
import { SIZE_PRESETS, DEFAULT_FONT_SIZE } from '../fonts';
import { useFonts } from './FontLoader';

// ---------------------------------------------------------------------------
// Remote user type
// ---------------------------------------------------------------------------

interface PresenceUser {
  id: string;
  name: string;
  color: string;
  cursor?: { blockId: string } | null;
}

// ---------------------------------------------------------------------------
// Toolbar Props
// ---------------------------------------------------------------------------

interface ToolbarProps {
  title?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  documentFont: string;
  onDocumentFontChange: (family: string) => void;
  documentFontSize: number;
  onDocumentFontSizeChange: (size: number) => void;
  remoteUsers?: PresenceUser[];
  syncStatus?: 'disconnected' | 'connecting' | 'connected' | 'synced';
  showSaved?: boolean;
  followingUserId?: string | null;
  onFollowUser?: (userId: string | null) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  hasTargetBlocks?: boolean;
  allTargetsFullWidth?: boolean;
  onToggleFullWidth?: () => void;
  /** Whether section nav has sections to show */
  hasSections?: boolean;
  /** Toggle section panel open/close */
  onToggleSectionPanel?: () => void;
  /** Open version history overlay */
  onOpenVersionHistory?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title = 'MiniNotion',
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onToggleViewMode,
  documentFont,
  onDocumentFontChange,
  documentFontSize,
  onDocumentFontSizeChange,
  remoteUsers,
  syncStatus,
  showSaved,
  followingUserId,
  onFollowUser,
  zoom = 1,
  onZoomChange,
  hasTargetBlocks,
  allTargetsFullWidth,
  onToggleFullWidth,
  hasSections,
  onToggleSectionPanel,
  onOpenVersionHistory,
}) => {
  const { allFonts, customFonts } = useFonts();
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fontOpen && !sizeOpen && !mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (fontOpen && !dropdownRef.current?.contains(e.target as Node)) setFontOpen(false);
      if (sizeOpen && !sizeDropdownRef.current?.contains(e.target as Node)) { setSizeOpen(false); setCustomSizeValue(''); }
      if (mobileMenuOpen && !mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fontOpen, sizeOpen, mobileMenuOpen]);

  const currentFontName = allFonts.find(f => f.family === documentFont)?.name || 'Padrão';
  const hasCollab = remoteUsers !== undefined;
  const followedUser = remoteUsers?.find(u => u.id === followingUserId);

  // Font list renderer (shared between desktop dropdown and mobile menu)
  const fontList = (onSelect: (family: string) => void) => (
    <>
      {allFonts.filter(f => !f.isCustom).map(font => (
        <button
          key={font.family}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
            documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
          }`}
          onClick={() => onSelect(font.family)}
        >
          <span style={{ fontFamily: font.family }}>{font.name}</span>
          {documentFont === font.family && <span className="text-blue-500 text-xs">&#10003;</span>}
        </button>
      ))}
      {customFonts.length > 0 && (
        <>
          <div className="border-t border-gray-100 my-1" />
          {customFonts.map(font => (
            <button
              key={font.family}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
              }`}
              onClick={() => onSelect(font.family)}
            >
              <span style={{ fontFamily: font.family }}>{font.name}</span>
              {documentFont === font.family && <span className="text-blue-500 text-xs">&#10003;</span>}
            </button>
          ))}
        </>
      )}
    </>
  );

  return (
    <div data-editor-toolbar className="shrink-0 bg-white/95 backdrop-blur-sm z-100 border-b border-gray-100 px-4 md:px-8 py-2 md:py-3 flex justify-between items-center shadow-sm gap-2">
      {/* Title */}
      <span className="font-semibold text-gray-800 text-sm md:text-base shrink-0 truncate max-w-30 md:max-w-none">
        {title}
      </span>

      {/* ---- Desktop controls ---- */}
      <div className="hidden md:flex gap-2 text-sm text-gray-500 items-center">
        {/* Follow banner */}
        {followedUser && (
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: followedUser.color }}
            onClick={() => onFollowUser?.(null)}
            title="Parar de seguir"
          >
            Seguindo {followedUser.name}
            <X size={12} />
          </button>
        )}

        {/* Remote users */}
        {hasCollab && remoteUsers && remoteUsers.length > 0 && (
          <>
            <div className="flex -space-x-1.5">
              {remoteUsers.slice(0, 5).map(user => (
                <button
                  key={user.id}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white transition-all hover:scale-110 hover:z-10 ${
                    followingUserId === user.id ? 'ring-2 ring-offset-1' : ''
                  }`}
                  style={{
                    backgroundColor: user.color,
                    borderColor: followingUserId === user.id ? user.color : 'white',
                  }}
                  title={followingUserId === user.id ? `Parar de seguir ${user.name}` : `Seguir ${user.name}`}
                  onClick={() => onFollowUser?.(followingUserId === user.id ? null : user.id)}
                >
                  {user.name.charAt(0).toUpperCase()}
                </button>
              ))}
              {remoteUsers.length > 5 && (
                <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-400 flex items-center justify-center text-[10px] font-bold text-white">
                  +{remoteUsers.length - 5}
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-gray-200 mx-1" />
          </>
        )}

        {hasCollab && syncStatus && <SyncDot status={syncStatus} showSaved={showSaved} />}
        {hasCollab && <div className="w-px h-4 bg-gray-200 mx-1" />}

        {/* Font selector */}
        <div ref={dropdownRef} className="relative">
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs transition-colors ${fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => setFontOpen(!fontOpen)}
            title="Fonte do documento"
          >
            <span className="max-w-25 truncate" style={{ fontFamily: documentFont || undefined }}>{currentFontName}</span>
            <ChevronDown size={12} />
          </button>
          {fontOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-50 max-h-75 overflow-y-auto z-50">
              {fontList((f) => { onDocumentFontChange(f); setFontOpen(false); })}
            </div>
          )}
        </div>

        {/* Font size selector */}
        <div ref={sizeDropdownRef} className="relative">
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs transition-colors ${sizeOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { setSizeOpen(!sizeOpen); setFontOpen(false); setCustomSizeValue(''); }}
            title="Tamanho da fonte do documento"
          >
            <span className="tabular-nums">{documentFontSize}</span>
            <ChevronDown size={12} />
          </button>
          {sizeOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-40 max-h-75 overflow-y-auto z-50">
              <div className="px-3 py-1.5 border-b border-gray-100">
                <input
                  type="number"
                  min={8}
                  max={200}
                  placeholder="Tamanho..."
                  value={customSizeValue}
                  onChange={e => setCustomSizeValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = parseInt(customSizeValue, 10);
                      if (val >= 8 && val <= 200) {
                        onDocumentFontSizeChange(val);
                        setSizeOpen(false);
                        setCustomSizeValue('');
                      }
                    }
                  }}
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                />
              </div>
              {SIZE_PRESETS.map(s => (
                <button
                  key={s}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    documentFontSize === s ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                  }`}
                  onClick={() => { onDocumentFontSizeChange(s); setSizeOpen(false); }}
                >
                  <span>{s === DEFAULT_FONT_SIZE ? `${s} (padrão)` : s}</span>
                  {documentFontSize === s && <span className="text-blue-500 text-xs">&#10003;</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <button onClick={onUndo} disabled={!canUndo} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Desfazer">
          <RotateCcw size={16} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Refazer">
          <RotateCw size={16} />
        </button>

        {onOpenVersionHistory && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={onOpenVersionHistory}
              className="p-1 hover:bg-gray-100 rounded text-gray-500"
              title="Histórico de versões"
            >
              <Clock size={16} />
            </button>
          </>
        )}

        {onToggleFullWidth && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={onToggleFullWidth}
              disabled={!hasTargetBlocks}
              className={`p-1 rounded transition-colors ${
                !hasTargetBlocks ? 'opacity-30 cursor-default' :
                allTargetsFullWidth ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-100'
              }`}
              title={allTargetsFullWidth ? 'Adicionar margens' : 'Remover margens'}
            >
              <MoveHorizontal size={16} />
            </button>
          </>
        )}

        <div className="w-px h-4 bg-gray-200 mx-2" />

        <button
          onClick={onToggleViewMode}
          className="p-1 hover:bg-gray-100 rounded text-gray-500"
          title={viewMode === 'continuous' ? 'Mudar para Paginado' : 'Mudar para Contínuo'}
        >
          {viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
        </button>

        {viewMode === 'paginated' && onZoomChange && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => onZoomChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))} disabled={zoom <= 0.25} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Diminuir zoom">
              <ZoomOut size={16} />
            </button>
            <button onClick={() => onZoomChange(1)} className="px-1.5 py-0.5 hover:bg-gray-100 rounded text-xs text-gray-600 min-w-12 text-center tabular-nums" title="Resetar zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 100) / 100))} disabled={zoom >= 3} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Aumentar zoom">
              <ZoomIn size={16} />
            </button>
          </>
        )}
      </div>

      {/* ---- Mobile controls ---- */}
      <div className="flex md:hidden items-center gap-1 text-gray-500">
        {/* Collab avatars (compact) */}
        {hasCollab && remoteUsers && remoteUsers.length > 0 && (
          <div className="flex -space-x-1.5 mr-1">
            {remoteUsers.slice(0, 3).map(user => (
              <div
                key={user.id}
                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {hasCollab && syncStatus && <SyncDot status={syncStatus} showSaved={showSaved} />}

        {/* Undo/Redo always visible */}
        <button onClick={onUndo} disabled={!canUndo} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30">
          <RotateCcw size={18} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30">
          <RotateCw size={18} />
        </button>

        {/* Overflow menu */}
        <div ref={mobileMenuRef} className="relative">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-1.5 rounded transition-colors ${mobileMenuOpen ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
          >
            <MoreHorizontal size={18} />
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-gray-200 rounded-xl py-2 w-56 z-50">
              {/* Font */}
              <div className="px-3 py-1.5 text-xs text-gray-400 uppercase tracking-wider">Fonte</div>
              <div className="max-h-32 overflow-y-auto">
                {fontList((f) => { onDocumentFontChange(f); setMobileMenuOpen(false); })}
              </div>

              <div className="border-t border-gray-100 my-1" />

              {/* Font size */}
              <div className="px-3 py-1.5 text-xs text-gray-400 uppercase tracking-wider">Tamanho</div>
              <div className="max-h-32 overflow-y-auto">
                {SIZE_PRESETS.map(s => (
                  <button
                    key={s}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                      documentFontSize === s ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                    }`}
                    onClick={() => { onDocumentFontSizeChange(s); setMobileMenuOpen(false); }}
                  >
                    <span>{s === DEFAULT_FONT_SIZE ? `${s} (padrão)` : s}</span>
                    {documentFontSize === s && <span className="text-blue-500 text-xs">&#10003;</span>}
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-100 my-1" />

              {/* Sections */}
              {hasSections && onToggleSectionPanel && (
                <button
                  onClick={() => { onToggleSectionPanel(); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <List size={16} />
                  Seções do documento
                </button>
              )}

              {/* Version history */}
              {onOpenVersionHistory && (
                <button
                  onClick={() => { onOpenVersionHistory(); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Clock size={16} />
                  Histórico de versões
                </button>
              )}

              {/* View mode */}
              <button
                onClick={() => { onToggleViewMode(); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
                {viewMode === 'continuous' ? 'Modo Paginado' : 'Modo Contínuo'}
              </button>

              {/* Full width */}
              {onToggleFullWidth && (
                <button
                  onClick={() => { onToggleFullWidth(); setMobileMenuOpen(false); }}
                  disabled={!hasTargetBlocks}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                >
                  <MoveHorizontal size={16} />
                  {allTargetsFullWidth ? 'Adicionar margens' : 'Remover margens'}
                </button>
              )}

              {/* Zoom */}
              {viewMode === 'paginated' && onZoomChange && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs text-gray-400">Zoom</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onZoomChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))} className="p-1 hover:bg-gray-100 rounded">
                        <ZoomOut size={14} />
                      </button>
                      <span className="text-xs text-gray-600 min-w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                      <button onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 100) / 100))} className="p-1 hover:bg-gray-100 rounded">
                        <ZoomIn size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Small sync indicator dot
const SyncDot: React.FC<{ status: string; showSaved?: boolean }> = ({ status, showSaved }) => {
  const colors: Record<string, string> = {
    disconnected: '#ef4444',
    connecting: '#f59e0b',
    connected: '#3b82f6',
    synced: '#10b981',
  };
  const labels: Record<string, string> = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    synced: 'Sincronizado',
  };
  return (
    <div className="flex items-center gap-1.5" title={labels[status] || ''}>
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[status] || '#9ca3af' }} />
      {showSaved && (
        <span className="text-xs text-green-600 animate-pulse">Salvo!</span>
      )}
    </div>
  );
};
