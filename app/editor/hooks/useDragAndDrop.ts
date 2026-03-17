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

    // Ghost — clone actual rendered block DOM for a real preview
    // Wrapper allows badge to overflow the inner container
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute', top: '-1000px',
      zIndex: '9999', pointerEvents: 'none',
      padding: '10px', // room for the badge to overflow
    });

    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      backgroundColor: 'white',
      padding: '8px', borderRadius: '6px', width: '320px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)', border: '1px solid #e5e7eb',
      overflow: 'hidden', position: 'relative',
    });
    wrapper.appendChild(ghost);

    const draggedBlocks = blocks.filter(b => ids.includes(b.id));
    draggedBlocks.slice(0, 3).forEach(b => {
      const blockEl = blockRefs.current?.[b.id];
      if (blockEl) {
        // Clone the .notion-block-content area (the actual rendered content, not the drag handle)
        const contentEl = blockEl.querySelector('.notion-block-content') as HTMLElement | null;
        const source = contentEl || blockEl;
        const clone = source.cloneNode(true) as HTMLElement;
        // Scale down to fit the ghost width
        Object.assign(clone.style, {
          transform: 'scale(0.85)', transformOrigin: 'top left',
          maxHeight: '120px', overflow: 'hidden', pointerEvents: 'none',
          marginBottom: '4px',
        });
        // Remove selection highlight (bg-blue-100) — reset to white/transparent
        clone.classList.remove('bg-blue-100');
        clone.classList.add('bg-white');
        // Also strip from any nested elements that may have selection bg
        clone.querySelectorAll('.bg-blue-100').forEach(el => {
          el.classList.remove('bg-blue-100');
        });
        // Remove interactive states
        clone.querySelectorAll('[contenteditable]').forEach(el => {
          (el as HTMLElement).removeAttribute('contenteditable');
        });
        ghost.appendChild(clone);
      } else {
        // Fallback: text label
        const div = document.createElement('div');
        div.textContent = b.content || ({
          text: 'Texto vazio', h1: 'Título vazio', h2: 'Subtítulo vazio',
          h3: 'Subtítulo vazio', bullet_list: 'Item com marcador',
          numbered_list: 'Item numerado', table: 'Tabela',
          divider: '———', image: 'Imagem',
        } as Record<string, string>)[b.type] || '';
        Object.assign(div.style, {
          fontSize: '12px', color: '#374151', marginBottom: '4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: b.type.startsWith('h') ? 'bold' : 'normal',
        });
        ghost.appendChild(div);
      }
    });
    if (draggedBlocks.length > 3) {
      const more = document.createElement('div');
      more.textContent = `+ mais ${draggedBlocks.length - 3} blocos...`;
      Object.assign(more.style, { fontSize: '10px', color: '#9ca3af', marginTop: '4px' });
      ghost.appendChild(more);
    }
    if (draggedBlocks.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = draggedBlocks.length.toString();
      Object.assign(badge.style, {
        position: 'absolute', top: '2px', right: '2px',
        backgroundColor: '#ef4444', color: 'white', borderRadius: '9999px',
        width: '20px', height: '20px', fontSize: '11px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
      });
      ghost.appendChild(badge);
    }
    document.body.appendChild(wrapper);
    e.dataTransfer.setDragImage(wrapper, 10, 10);
    setTimeout(() => document.body.removeChild(wrapper), 0);
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
