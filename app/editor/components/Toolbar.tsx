'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, RotateCw, FileText, Scroll, ChevronDown, X, ZoomIn, ZoomOut, MoveHorizontal } from 'lucide-react';
import { ViewMode } from '../types';
import { useFonts } from './FontLoader';

// ---------------------------------------------------------------------------
// Remote user type (minimal — avoids importing from collaboration)
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
  /** Remote users for presence display (optional — only in collab mode) */
  remoteUsers?: PresenceUser[];
  /** Sync status indicator (optional) */
  syncStatus?: 'disconnected' | 'connecting' | 'connected' | 'synced';
  /** Currently followed user ID */
  followingUserId?: string | null;
  /** Called when user clicks an avatar to follow/unfollow */
  onFollowUser?: (userId: string | null) => void;
  /** Current zoom level (0.1–3) */
  zoom?: number;
  /** Called when zoom changes */
  onZoomChange?: (zoom: number) => void;
  /** Whether there are target blocks for fullWidth toggle */
  hasTargetBlocks?: boolean;
  /** Whether all target blocks are already fullWidth */
  allTargetsFullWidth?: boolean;
  /** Toggle fullWidth on target blocks */
  onToggleFullWidth?: () => void;
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
  remoteUsers,
  syncStatus,
  followingUserId,
  onFollowUser,
  zoom = 1,
  onZoomChange,
  hasTargetBlocks,
  allTargetsFullWidth,
  onToggleFullWidth,
}) => {
  const { allFonts, customFonts } = useFonts();
  const [fontOpen, setFontOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fontOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setFontOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fontOpen]);

  const currentFontName = allFonts.find(f => f.family === documentFont)?.name || 'Padrão';
  const hasCollab = remoteUsers !== undefined;
  const followedUser = remoteUsers?.find(u => u.id === followingUserId);

  return (
    <div data-editor-toolbar className="shrink-0 bg-white/95 backdrop-blur-sm z-100 border-b border-gray-100 px-8 py-3 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="font-semibold text-gray-800">{title}</span>
      </div>

      <div className="flex gap-2 text-sm text-gray-500 items-center">
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

        {/* Remote users presence */}
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
                    outlineColor: followingUserId === user.id ? user.color : undefined,
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

        {/* Sync status */}
        {hasCollab && syncStatus && <SyncDot status={syncStatus} />}
        {hasCollab && <div className="w-px h-4 bg-gray-200 mx-1" />}

        {/* Document font selector */}
        <div ref={dropdownRef} className="relative">
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs transition-colors ${fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => setFontOpen(!fontOpen)}
            title="Fonte do documento"
          >
            <span className="max-w-25 truncate" style={{ fontFamily: documentFont || undefined }}>
              {currentFontName}
            </span>
            <ChevronDown size={12} />
          </button>

          {fontOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-50 max-h-75 overflow-y-auto z-50">
              {allFonts.filter(f => !f.isCustom).length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 py-1">
                    Fontes do sistema
                  </div>
                  {allFonts.filter(f => !f.isCustom).map(font => (
                    <button
                      key={font.family}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                        documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                      }`}
                      onClick={() => {
                        onDocumentFontChange(font.family);
                        setFontOpen(false);
                      }}
                    >
                      <span style={{ fontFamily: font.family }}>{font.name}</span>
                      {documentFont === font.family && (
                        <span className="text-blue-500 text-xs">&#10003;</span>
                      )}
                    </button>
                  ))}
                </>
              )}
              {customFonts.length > 0 && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 py-1">
                    Fontes customizadas
                  </div>
                  {customFonts.map(font => (
                    <button
                      key={font.family}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                        documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                      }`}
                      onClick={() => {
                        onDocumentFontChange(font.family);
                        setFontOpen(false);
                      }}
                    >
                      <span style={{ fontFamily: font.family }}>{font.name}</span>
                      {documentFont === font.family && (
                        <span className="text-blue-500 text-xs">&#10003;</span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
          title="Desfazer"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
          title="Refazer"
        >
          <RotateCw size={16} />
        </button>
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
          className="p-1 hover:bg-gray-100 rounded text-gray-500 flex items-center gap-2"
          title={viewMode === 'continuous' ? 'Mudar para Paginado' : 'Mudar para Contínuo'}
        >
          {viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
        </button>

        {viewMode === 'paginated' && onZoomChange && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={() => onZoomChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))}
              disabled={zoom <= 0.25}
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
              title="Diminuir zoom"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => onZoomChange(1)}
              className="px-1.5 py-0.5 hover:bg-gray-100 rounded text-xs text-gray-600 min-w-[3rem] text-center tabular-nums"
              title="Resetar zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 100) / 100))}
              disabled={zoom >= 3}
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
              title="Aumentar zoom"
            >
              <ZoomIn size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Small sync indicator dot
const SyncDot: React.FC<{ status: string }> = ({ status }) => {
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
    </div>
  );
};
