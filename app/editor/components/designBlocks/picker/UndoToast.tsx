'use client';

// ---------------------------------------------------------------------------
// UndoToast — single toast, bottom-right, with countdown ring + undo action
// ---------------------------------------------------------------------------
// Used after destructive operations (delete template / delete clause). The
// caller is responsible for actually performing the destructive operation
// before showing the toast — the toast just gives the user 5s to call the
// onUndo callback to restore.
//
// Auto-dismisses after `durationMs`. Click anywhere outside doesn't dismiss
// (we want this to be hard to miss; pressing Esc or waiting is enough).
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Undo2, X } from 'lucide-react';

export interface UndoToastProps {
  message: string;
  durationMs?: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  message, durationMs = 5000, onUndo, onDismiss,
}) => {
  const [remaining, setRemaining] = useState(durationMs);

  // Stable refs so the timer effect doesn't re-mount on every parent render
  // (which would reset the countdown). The callbacks always read the latest
  // values via the ref.
  const onDismissRef = useRef(onDismiss);
  const onUndoRef = useRef(onUndo);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    onUndoRef.current = onUndo;
  });

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, durationMs - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onDismissRef.current();
      }
    }, 100);
    return () => clearInterval(tick);
  }, [durationMs]);

  // Esc dismisses (without undo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismissRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const progress = remaining / durationMs;

  return createPortal(
    <div
      data-design-picker
      className="fixed bottom-4 right-4 z-[1200] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl max-w-sm"
      role="status"
      aria-live="polite"
      // Defense in depth: even though the toast is portaled to body and is
      // a sibling of the picker modal in React's virtual tree, we explicitly
      // stop mousedown from bubbling so no parent handler upstream of
      // DesignBlockPicker can interpret a click here as "click outside".
      onMouseDown={e => e.stopPropagation()}
    >
      <Trash2 size={16} className="text-red-300 shrink-0" />
      <span className="text-sm flex-1 truncate">{message}</span>
      <button
        onClick={onUndo}
        className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors shrink-0"
      >
        <Undo2 size={12} /> Desfazer
      </button>
      <button
        onClick={onDismiss}
        className="p-1 text-gray-400 hover:text-white shrink-0"
        title="Fechar"
      >
        <X size={14} />
      </button>
      {/* Progress bar at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-b-xl overflow-hidden">
        <div
          className="h-full bg-purple-400 transition-[width] ease-linear"
          style={{ width: `${progress * 100}%`, transitionDuration: '100ms' }}
        />
      </div>
    </div>,
    document.body,
  );
};
