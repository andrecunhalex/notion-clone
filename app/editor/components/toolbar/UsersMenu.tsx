'use client';

/**
 * UsersMenu — dropdown that lists everyone currently in the document.
 * Opened from the avatar caret in the right pill; clicking a remote user
 * toggles "follow" mode.
 */

import React from 'react';
import type { PresenceUser } from './OverflowMenu';

interface UsersMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  remoteUsers: PresenceUser[];
  followingUserId: string | null;
  currentUserName?: string;
  currentUserColor?: string;
  onFollowUser?: (id: string | null) => void;
  onClose: () => void;
}

export const UsersMenu: React.FC<UsersMenuProps> = ({
  menuRef, menuPos, remoteUsers, followingUserId,
  currentUserName, currentUserColor, onFollowUser, onClose,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-xl py-2 w-64"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => e.stopPropagation()}
  >
    <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
      No documento
    </div>

    {/* Current user (always first, no interaction) */}
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: currentUserColor || '#3176ff' }}
      >
        {(currentUserName || 'V').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 truncate">{currentUserName || 'Você'}</div>
        <div className="text-[10px] text-gray-400">Você</div>
      </div>
    </div>

    {/* Remote users — click to toggle follow */}
    {remoteUsers.map(user => {
      const isFollowing = followingUserId === user.id;
      return (
        <button
          key={user.id}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onFollowUser?.(isFollowing ? null : user.id); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
            isFollowing ? 'bg-gray-50' : 'hover:bg-gray-50'
          }`}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800 truncate">{user.name}</div>
            <div className="text-[10px] text-gray-400">
              {isFollowing ? 'Seguindo — clique para parar' : 'Clique para seguir'}
            </div>
          </div>
        </button>
      );
    })}
  </div>
);
