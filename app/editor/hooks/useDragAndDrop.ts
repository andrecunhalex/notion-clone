import { useState, useCallback, useRef, RefObject } from 'react';
import { DropTarget, BlockData } from '../types';

interface UseDragAndDropProps {
  blocks: BlockData[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  blockRefs: RefObject<{ [key: string]: HTMLDivElement | null }>;
  moveBlocks: (ids: string[], targetId: string, position: 'top' | 'bottom') => void;
}

export const useDragAndDrop = ({
  blocks, selectedIds, setSelectedIds, blockRefs, moveBlocks,
}: UseDragAndDropProps) => {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Ref para blocks sempre atualizado
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Estado mutável do drag — zero closures stale
  const drag = useRef({ ids: [] as string[], target: null as DropTarget | null });

  const setTarget = useCallback((t: DropTarget | null) => {
    drag.current.target = t;
    setDropTarget(t);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id];
    if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    drag.current.ids = ids;
    drag.current.target = null;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';

    // Ghost
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'absolute', top: '-1000px', backgroundColor: 'white',
      padding: '12px', borderRadius: '6px', width: '280px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)', border: '1px solid #e5e7eb',
      zIndex: '9999', pointerEvents: 'none',
    });
    const draggedBlocks = blocks.filter(b => ids.includes(b.id));
    draggedBlocks.slice(0, 3).forEach(b => {
      const div = document.createElement('div');
      div.textContent = b.content || (b.type === 'text' ? 'Texto vazio' : 'Título vazio');
      Object.assign(div.style, {
        fontSize: '12px', color: '#374151', marginBottom: '4px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: b.type.startsWith('h') ? 'bold' : 'normal',
      });
      ghost.appendChild(div);
    });
    if (draggedBlocks.length > 3) {
      const more = document.createElement('div');
      more.textContent = `+ mais ${draggedBlocks.length - 3} blocos...`;
      Object.assign(more.style, { fontSize: '10px', color: '#9ca3af' });
      ghost.appendChild(more);
    }
    if (draggedBlocks.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = draggedBlocks.length.toString();
      Object.assign(badge.style, {
        position: 'absolute', top: '-8px', right: '-8px',
        backgroundColor: '#ef4444', color: 'white', borderRadius: '9999px',
        width: '20px', height: '20px', fontSize: '11px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
      });
      ghost.appendChild(badge);
    }
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, [blocks, selectedIds, setSelectedIds]);

  // Block-level: seta target para blocos NÃO arrastados
  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (drag.current.ids.includes(targetId)) return;
    const el = blockRefs.current?.[targetId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos: 'top' | 'bottom' = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    setTarget({ id: targetId, position: pos });
  }, [blockRefs, setTarget]);

  // Container-level: trata extremidades (acima do primeiro / abaixo do último)
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { ids } = drag.current;
    if (ids.length === 0) return;
    const nonDragged = blocksRef.current.filter(b => !ids.includes(b.id));
    if (nonDragged.length === 0) return;
    const first = blockRefs.current?.[nonDragged[0].id];
    const last = blockRefs.current?.[nonDragged[nonDragged.length - 1].id];
    if (first && e.clientY < first.getBoundingClientRect().top) {
      setTarget({ id: nonDragged[0].id, position: 'top' });
    } else if (last && e.clientY > last.getBoundingClientRect().bottom) {
      setTarget({ id: nonDragged[nonDragged.length - 1].id, position: 'bottom' });
    }
  }, [blockRefs, setTarget]);

  // Executa o move lendo do ref — sempre pega o valor atual
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const { target, ids } = drag.current;
    if (!target || ids.length === 0) return;
    moveBlocks(ids, target.id, target.position);
    drag.current = { ids: [], target: null };
    setDropTarget(null);
  }, [moveBlocks]);

  const clearDropTarget = useCallback(() => {
    drag.current = { ids: [], target: null };
    setDropTarget(null);
  }, []);

  return {
    dropTarget, handleDragStart, handleDragOver,
    handleContainerDragOver, handleDrop, clearDropTarget,
  };
};
