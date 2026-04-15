'use client';

/**
 * OverflowMenu — secondary/infrequent controls that don't need space in the
 * main pill. Version history, settings, sections panel, view mode toggle,
 * full-width toggle.
 */

import React from 'react';
import { Clock, Settings, List, FileText, Scroll, MoveHorizontal } from 'lucide-react';
import { ViewMode } from '../../types';

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  cursor?: { blockId: string } | null;
}

interface OverflowMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  hasTargetBlocks?: boolean;
  allTargetsFullWidth?: boolean;
  onToggleFullWidth?: () => void;
  hasSections?: boolean;
  onToggleSectionPanel?: () => void;
  onOpenVersionHistory?: () => void;
  onToggleSettings?: () => void;
}

const OverflowItem: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}> = ({ onClick, disabled, icon, label }) => (
  <button
    type="button"
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default"
  >
    <span className="text-gray-500">{icon}</span>
    {label}
  </button>
);

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  menuRef, menuPos, viewMode, onToggleViewMode,
  hasTargetBlocks, allTargetsFullWidth, onToggleFullWidth,
  hasSections, onToggleSectionPanel,
  onOpenVersionHistory, onToggleSettings,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-xl py-1 w-56"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => e.stopPropagation()}
  >
    {onOpenVersionHistory && (
      <OverflowItem onClick={onOpenVersionHistory} icon={<Clock size={16} />} label="Histórico de versões" />
    )}
    {onToggleSettings && (
      <OverflowItem onClick={onToggleSettings} icon={<Settings size={16} />} label="Configurações do docs" />
    )}
    {hasSections && onToggleSectionPanel && (
      <OverflowItem onClick={onToggleSectionPanel} icon={<List size={16} />} label="Seções" />
    )}
    <div className="border-t border-gray-100 my-1" />
    <OverflowItem
      onClick={onToggleViewMode}
      icon={viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
      label={viewMode === 'continuous' ? 'Modo paginado' : 'Modo contínuo'}
    />
    {onToggleFullWidth && (
      <OverflowItem
        onClick={onToggleFullWidth}
        disabled={!hasTargetBlocks}
        icon={<MoveHorizontal size={16} />}
        label={allTargetsFullWidth ? 'Adicionar margens' : 'Remover margens'}
      />
    )}
  </div>
);
