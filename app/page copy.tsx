// use client
"use client";
import React, { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';
import { GripVertical, Type, Heading1, Heading2, RotateCcw, RotateCw, LucideIcon } from 'lucide-react';

// --- Tipos ---
type BlockType = 'text' | 'h1' | 'h2';

interface BlockData {
  id: string;
  type: BlockType;
  content: string;
}

interface SlashMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  blockId: string | null;
}

interface SelectionBox {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface DropTarget {
  id: string;
  position: 'top' | 'bottom';
}

// --- Utilitários ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const initialBlock: BlockData = { id: 'initial-block', type: 'text', content: '' };

// --- Hook de Histórico (Undo/Redo) ---
const useHistory = <T,>(initialState: T): [T, (newState: T) => void, () => void, () => void, boolean, boolean] => {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<T[]>([initialState]);
  const [pointer, setPointer] = useState(0);

  const set = (newState: T) => {
    const nextHistory = [...history.slice(0, pointer + 1), newState];
    setHistory(nextHistory);
    setPointer(nextHistory.length - 1);
    setState(newState);
  };

  const undo = () => {
    if (pointer > 0) {
      setPointer(pointer - 1);
      setState(history[pointer - 1]);
    }
  };

  const redo = () => {
    if (pointer < history.length - 1) {
      setPointer(pointer + 1);
      setState(history[pointer + 1]);
    }
  };

  return [state, set, undo, redo, pointer > 0, pointer < history.length - 1];
};

// --- Componente Principal ---
export default function Home() {
  const [blocks, setBlocks, undo, redo, canUndo, canRedo] = useHistory<BlockData[]>([initialBlock]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({ isOpen: false, x: 0, y: 0, blockId: null });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  // --- Teclado Global e Colar ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeElement = document.activeElement as HTMLElement;
        const activeTag = activeElement.tagName;
        const isEditing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement.isContentEditable;
        
        if (selectedIds.size > 0 && (!isEditing || selectedIds.size > 1)) {
           if (isEditing) activeElement.blur();
           e.preventDefault();
           const newBlocks = blocks.filter(b => !selectedIds.has(b.id));
           if (newBlocks.length === 0) newBlocks.push({ id: generateId(), type: 'text', content: '' });
           setBlocks(newBlocks);
           setSelectedIds(new Set());
        }
      }

      // Copiar (Correção: Usando execCommand para compatibilidade com iframe)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault(); // Previne comportamento padrão
        const selectedBlocks = blocks.filter(b => selectedIds.has(b.id));
        const jsonString = JSON.stringify(selectedBlocks);

        // Cria textarea temporária para copiar
        const textArea = document.createElement("textarea");
        textArea.value = jsonString;
        textArea.style.position = "fixed"; // Evita scroll
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Falha ao copiar', err);
        }
        
        document.body.removeChild(textArea);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;
        const text = clipboardData.getData('text');
        try {
            const pastedData = JSON.parse(text);
            // Verifica se é o formato de blocos do nosso app
            if (Array.isArray(pastedData) && pastedData[0].content !== undefined) {
                e.preventDefault();
                const newBlocks = pastedData.map((b: any) => ({ ...b, id: generateId() }));
                
                let insertIndex = blocks.length;
                let shouldReplace = false;

                // Cenario 1: Tem blocos selecionados (via drag/rubber band)
                if (selectedIds.size > 0) {
                    // Acha o índice do último bloco selecionado para colar depois dele
                    let maxIndex = -1;
                    blocks.forEach((b, i) => {
                        if (selectedIds.has(b.id)) maxIndex = i;
                    });
                    if (maxIndex !== -1) {
                        insertIndex = maxIndex + 1;
                    }
                } 
                // Cenario 2: Está com foco em um bloco (editando texto)
                else if (document.activeElement && document.activeElement.id.startsWith('editable-')) {
                    const activeId = document.activeElement.id.replace('editable-', '');
                    const activeIndex = blocks.findIndex(b => b.id === activeId);
                    
                    if (activeIndex !== -1) {
                        const activeBlock = blocks[activeIndex];
                        // Se o bloco atual for texto e estiver vazio, substituímos ele!
                        if (activeBlock.type === 'text' && activeBlock.content.trim() === '') {
                            shouldReplace = true;
                            insertIndex = activeIndex;
                        } else {
                            // Senão, cola embaixo
                            insertIndex = activeIndex + 1;
                        }
                    }
                }

                // Cria nova lista
                const finalBlocks = [...blocks];
                
                if (shouldReplace) {
                    finalBlocks.splice(insertIndex, 1, ...newBlocks);
                } else {
                    finalBlocks.splice(insertIndex, 0, ...newBlocks);
                }

                setBlocks(finalBlocks);
            }
        } catch (err) {}
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('paste', handlePaste);
    };
  }, [blocks, selectedIds, undo, redo]);

  // --- Seleção Global (Rubber Band) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.notion-block-content') || target.closest('.drag-handle')) {
        return; 
    }
    
    setSlashMenu({ ...slashMenu, isOpen: false });

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    
    setSelectionBox({ startX, startY, curX: startX, curY: startY });
    setSelectedIds(new Set());
    
    if (document.activeElement) (document.activeElement as HTMLElement).blur();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (selectionBox && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        setSelectionBox(prev => prev ? ({ ...prev, curX, curY }) : null);

        const selRect = {
            left: Math.min(selectionBox.startX, curX),
            top: Math.min(selectionBox.startY, curY),
            right: Math.max(selectionBox.startX, curX),
            bottom: Math.max(selectionBox.startY, curY)
        };

        const newSelected = new Set<string>();
        blocks.forEach(block => {
            const el = blockRefs.current[block.id];
            if (el) {
                const elRect = el.getBoundingClientRect();
                const relativeEl = {
                    left: elRect.left - rect.left,
                    top: elRect.top - rect.top,
                    width: elRect.width,
                    height: elRect.height
                };

                if (
                    selRect.left < relativeEl.left + relativeEl.width &&
                    selRect.right > relativeEl.left &&
                    selRect.top < relativeEl.top + relativeEl.height &&
                    selRect.bottom > relativeEl.top
                ) {
                    newSelected.add(block.id);
                }
            }
        });
        setSelectedIds(newSelected);
    }
  };

  const handleMouseUp = () => {
    setSelectionBox(null);
    setDropTarget(null);
  };

  // --- Gerenciamento de Blocos ---
  const updateBlock = (id: string, updates: Partial<BlockData>) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, ...updates } : b);
    setBlocks(newBlocks);
  };

  const addBlock = (afterId: string) => {
    const index = blocks.findIndex(b => b.id === afterId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content: '' };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    
    setTimeout(() => {
        const el = document.getElementById(`editable-${newBlock.id}`);
        if(el) el.focus();
    }, 0);
  };

  const removeBlock = (id: string) => {
     if (blocks.length === 1) return;
     const index = blocks.findIndex(b => b.id === id);
     const newBlocks = blocks.filter(b => b.id !== id);
     setBlocks(newBlocks);
     
     if (index > 0) {
         setTimeout(() => {
             const el = document.getElementById(`editable-${newBlocks[index-1].id}`);
             if(el) {
                 el.focus();
                 const range = document.createRange();
                 const sel = window.getSelection();
                 if (sel) {
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                 }
             }
         }, 0);
     }
  };

  // --- Lógica Inteligente de Clique no Fundo ---
  const handleBottomClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evita conflito com seleção global
    
    const lastBlock = blocks[blocks.length - 1];

    // Se o último bloco já existe, é texto e está vazio, apenas foca nele
    if (lastBlock && lastBlock.type === 'text' && lastBlock.content === '') {
        setTimeout(() => {
            const el = document.getElementById(`editable-${lastBlock.id}`);
            if (el) el.focus();
        }, 0);
    } else {
        // Caso contrário (último bloco tem conteúdo ou não é texto), cria um novo
        addBlock(lastBlock?.id);
    }
  };

  // --- Drag & Drop com "Ghost" ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
     e.dataTransfer.setData('text/plain', id);
     e.dataTransfer.effectAllowed = 'move';
     
     let idsDragging = new Set(selectedIds);
     if (!idsDragging.has(id)) {
         idsDragging = new Set([id]);
         setSelectedIds(idsDragging);
     }

     const ghost = document.createElement('div');
     Object.assign(ghost.style, {
         position: 'absolute', top: '-1000px', backgroundColor: 'white',
         padding: '12px', borderRadius: '6px', width: '280px',
         boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
         border: '1px solid #e5e7eb', zIndex: '9999', pointerEvents: 'none'
     });

     const draggedBlocks = blocks.filter(b => idsDragging.has(b.id));
     
     draggedBlocks.slice(0, 3).forEach(b => {
         const div = document.createElement('div');
         div.textContent = b.content || (b.type === 'text' ? 'Texto vazio' : 'Título vazio');
         Object.assign(div.style, {
            fontSize: '12px', color: '#374151', marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: b.type.startsWith('h') ? 'bold' : 'normal'
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
             display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
         });
         ghost.appendChild(badge);
     }

     document.body.appendChild(ghost);
     e.dataTransfer.setDragImage(ghost, 0, 0);
     setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const el = blockRefs.current[targetId];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const position = e.clientY < (rect.top + rect.height / 2) ? 'top' : 'bottom';
      setDropTarget({ id: targetId, position });
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!dropTarget) return;

      const idsToMove = selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId];
      const itemsToMove = blocks.filter(b => idsToMove.includes(b.id));
      let remainingBlocks = blocks.filter(b => !idsToMove.includes(b.id));
      let targetIndex = remainingBlocks.findIndex(b => b.id === dropTarget.id);
      
      if (targetIndex === -1) { setDropTarget(null); return; }
      if (dropTarget.position === 'bottom') targetIndex += 1;

      remainingBlocks.splice(targetIndex, 0, ...itemsToMove);
      setBlocks(remainingBlocks);
      setDropTarget(null);
  };

  return (
    <div 
        className={`min-h-screen bg-white text-gray-800 font-sans selection:bg-blue-200 ${selectionBox ? 'select-none' : ''}`}
        onMouseDown={handleMouseDown} 
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setSelectionBox(null); setDropTarget(null); }}
        onDragEnd={() => setDropTarget(null)}
    >
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-30 border-b border-gray-100 px-8 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 text-gray-500">
            <span className="font-semibold text-gray-800">MiniNotion</span>
        </div>
        <div className="flex gap-2 text-sm text-gray-500">
             <button onClick={undo} disabled={!canUndo} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Desfazer"><RotateCcw size={16}/></button>
             <button onClick={redo} disabled={!canRedo} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30" title="Refazer"><RotateCw size={16}/></button>
        </div>
      </div>

      <div ref={containerRef} className="max-w-3xl mx-auto mt-12 px-12 pb-64 min-h-[80vh] relative cursor-text">
        <div className="mb-8 group">
            <h1 className="text-4xl font-bold text-gray-900 mb-2 outline-none" contentEditable suppressContentEditableWarning>Sem Título</h1>
        </div>

        {blocks.map((block, index) => (
            <Block 
                key={block.id}
                index={index}
                block={block}
                isSelected={selectedIds.has(block.id)}
                updateBlock={updateBlock}
                addBlock={addBlock}
                removeBlock={removeBlock}
                setSlashMenu={setSlashMenu}
                blockRef={(el) => (blockRefs.current[block.id] = el)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                dropTarget={dropTarget}
            />
        ))}
        
        {/* Área de Clique Inteligente no Final */}
        <div 
            className="h-32 -mx-12 cursor-text" 
            onClick={handleBottomClick}
        />
      </div>

      {selectionBox && (
        <div
            className="fixed bg-blue-400/20 border border-blue-400 pointer-events-none z-50"
            style={{
                left: Math.min(selectionBox.startX, selectionBox.curX) + (containerRef.current?.getBoundingClientRect().left || 0),
                top: Math.min(selectionBox.startY, selectionBox.curY) + (containerRef.current?.getBoundingClientRect().top || 0),
                width: Math.abs(selectionBox.curX - selectionBox.startX),
                height: Math.abs(selectionBox.curY - selectionBox.startY),
            }}
        />
      )}

      {/* Menu Slash */}
      {slashMenu.isOpen && (
          <SlashMenu 
            x={slashMenu.x} 
            y={slashMenu.y} 
            close={() => setSlashMenu({ ...slashMenu, isOpen: false })}
            onSelect={(type) => {
                if (!slashMenu.blockId) return;
                const currentBlock = blocks.find(b => b.id === slashMenu.blockId);
                if (!currentBlock) return;

                const cleanContent = currentBlock.content.endsWith('/') 
                    ? currentBlock.content.slice(0, -1) 
                    : currentBlock.content;

                const el = document.getElementById(`editable-${slashMenu.blockId}`);
                if (el) el.innerText = cleanContent;

                updateBlock(slashMenu.blockId, { type, content: cleanContent });
                setSlashMenu({ ...slashMenu, isOpen: false });
                
                setTimeout(() => {
                    const el = document.getElementById(`editable-${slashMenu.blockId}`);
                    if (el) {
                        el.focus();
                        const range = document.createRange();
                        const sel = window.getSelection();
                        if (sel) {
                            range.selectNodeContents(el);
                            range.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }
                }, 0);
            }}
          />
      )}
    </div>
  );
}

// --- Componente de Bloco ---
interface BlockProps {
    block: BlockData;
    index: number;
    isSelected: boolean;
    updateBlock: (id: string, updates: Partial<BlockData>) => void;
    addBlock: (afterId: string) => void;
    removeBlock: (id: string) => void;
    setSlashMenu: Dispatch<SetStateAction<SlashMenuState>>;
    blockRef: (el: HTMLDivElement | null) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragOver: (e: React.DragEvent, id: string) => void;
    onDrop: (e: React.DragEvent) => void;
    dropTarget: DropTarget | null;
}

const Block: React.FC<BlockProps> = ({ block, index, isSelected, updateBlock, addBlock, removeBlock, setSlashMenu, blockRef, onDragStart, onDragOver, onDrop, dropTarget }) => {
    
    useEffect(() => {
        const el = document.getElementById(`editable-${block.id}`);
        if (el && document.activeElement !== el && el.innerText !== block.content) {
            el.innerText = block.content;
        }
    }, [block.content, block.id]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === '/') {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const rect = selection.getRangeAt(0).getBoundingClientRect();
                    setSlashMenu({
                        isOpen: true,
                        x: rect.left,
                        y: rect.bottom + 10,
                        blockId: block.id
                    });
                }
            }, 0);
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addBlock(block.id);
        }
        if (e.key === 'Backspace' && block.content === '') {
            e.preventDefault();
            removeBlock(block.id);
        }
        if (e.key === 'ArrowUp') {
             const currentEl = document.getElementById(`editable-${block.id}`);
             const blockContainer = currentEl?.closest('.group');
             const prev = blockContainer?.previousSibling as HTMLElement;
             if(prev) {
                const editable = prev.querySelector('[contenteditable]') as HTMLElement;
                if (editable) editable.focus();
             }
        }
        if (e.key === 'ArrowDown') {
             const currentEl = document.getElementById(`editable-${block.id}`);
             const blockContainer = currentEl?.closest('.group');
             const next = blockContainer?.nextSibling as HTMLElement;
             if(next) {
                const editable = next.querySelector('[contenteditable]') as HTMLElement;
                if (editable) editable.focus();
             }
        }
    };

    const styles: Record<string, string> = {
        h1: "text-3xl font-bold mt-6 mb-2 text-gray-900",
        h2: "text-2xl font-semibold mt-4 mb-2 text-gray-800",
        text: "text-base my-1 text-gray-700 leading-relaxed"
    };

    const showPlaceholder = index === 0 && block.type === 'text';

    return (
        <div 
            ref={blockRef}
            className={`group relative flex items-start -ml-12 pl-12 pr-2 py-0.5 transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
            onDragOver={(e) => onDragOver(e, block.id)}
            onDrop={onDrop}
        >
            {dropTarget && dropTarget.id === block.id && (
                <div 
                    className="absolute left-0 right-0 h-1 bg-blue-500 pointer-events-none z-10"
                    style={{ top: dropTarget.position === 'top' ? '-2px' : 'auto', bottom: dropTarget.position === 'bottom' ? '-2px' : 'auto' }}
                />
            )}

            <div 
                className="drag-handle absolute left-2 top-1.5 p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-opacity"
                draggable
                onDragStart={(e) => onDragStart(e, block.id)}
                onMouseDown={(e) => e.stopPropagation()} 
            >
                <GripVertical size={16} />
            </div>

            <div className="flex-1 min-w-0 notion-block-content">
                <div
                    id={`editable-${block.id}`}
                    contentEditable
                    suppressContentEditableWarning
                    className={`outline-none empty:before:text-gray-300 cursor-text ${styles[block.type]} ${showPlaceholder ? 'empty:before:content-[attr(data-placeholder)]' : ''}`}
                    data-placeholder="Digite '/' para comandos..."
                    onKeyDown={handleKeyDown}
                    onInput={(e) => updateBlock(block.id, { content: e.currentTarget.innerText })}
                />
            </div>
        </div>
    );
};

// --- Menu Slash ---
interface SlashMenuProps {
    x: number;
    y: number;
    close: () => void;
    onSelect: (type: BlockType) => void;
}

const MENU_OPTIONS: { type: BlockType; label: string; icon: LucideIcon }[] = [
    { type: 'text', label: 'Texto', icon: Type },
    { type: 'h1', label: 'Título 1', icon: Heading1 },
    { type: 'h2', label: 'Título 2', icon: Heading2 },
];

const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, close, onSelect }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Navegação via teclado
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev + 1) % MENU_OPTIONS.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev - 1 + MENU_OPTIONS.length) % MENU_OPTIONS.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onSelect(MENU_OPTIONS[selectedIndex].type);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedIndex, close, onSelect]);

    useEffect(() => {
        const handle = () => close();
        window.addEventListener('click', handle);
        return () => window.removeEventListener('click', handle);
    }, [close]);


    return (
        <div 
            className="fixed bg-white shadow-xl border border-gray-200 rounded-lg p-1 w-48 z-50 flex flex-col"
            style={{ left: x, top: y }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">Blocos Básicos</div>
            {MENU_OPTIONS.map((opt, i) => (
                <button
                    key={opt.type}
                    onClick={() => onSelect(opt.type)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded text-left transition-colors ${i === selectedIndex ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                    <opt.icon size={16} />
                    {opt.label}
                </button>
            ))}
        </div>
    );
};