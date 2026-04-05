# Lex Studio - Editor de Documentos

Editor de documentos colaborativo estilo Notion, construido com Next.js, React, Yjs (CRDT) e Supabase.

## Funcionalidades

### Editor
- Blocos: texto, titulos (h1/h2/h3), listas (bullet/numerada), tabelas, imagens, dividers
- Design blocks: templates HTML/Tailwind customizaveis (cards, callouts, itens numerados)
- Formatacao rica: negrito, italico, sublinhado, cores de texto/fundo, fontes, tamanhos
- Drag-and-drop de blocos
- Modo paginado (A4) com zoom e modo continuo
- Slash menu (`/`) para inserir blocos
- Undo/Redo com historico
- Navegacao por secoes (sumario lateral + botoes de navegacao nas paginas)
- Full-width toggle para blocos

### Colaboracao em tempo real
- Yjs (CRDT) para merge automatico de edicoes
- Supabase Realtime para sincronizacao entre usuarios
- IndexedDB para cache offline
- Cursores remotos com posicao em tempo real
- Presenca de usuarios na toolbar
- Modo solo otimizado (sem broadcasts quando sozinho)
- Save manual (Ctrl+S)

### Historico de versoes
- Snapshots automaticos baseados em sessoes de edicao (salva ao abrir + editar)
- Visualizacao side-by-side: versao anterior vs versao atual
- Diff inline a nivel de palavras (texto, design blocks, celulas de tabela)
- Destaque de blocos adicionados (verde) e removidos (vermelho)
- Restaurar versao anterior com um clique
- Comparacao campo-a-campo (evita falsos positivos do JSON.stringify)
- Responsivo: tabs no mobile, side-by-side no desktop, sidebar em telas xl
- Feature toggle: `enableVersionHistory` no config (pode ser premium)

### Modo somente leitura
- Prop `readOnly` no NotionEditor
- Bloqueia todas as mutacoes no nivel da logica (`setBlocks` vira no-op)
- `pointer-events: none` no conteudo (UX)
- Toolbar, slash menu, floating toolbar ocultados
- Drag handles invisiveis, contentEditable desabilitado

## Setup

### Requisitos
- Node.js 18+
- Conta Supabase (para colaboracao e historico de versoes)

### Instalacao

```bash
npm install
```

### Variaveis de ambiente

Crie `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase - SQL Migrations

Execute os arquivos SQL na pasta `supabase/` na ordem:

```
supabase/001_documents.sql          -- Tabela de documentos (estado Yjs)
supabase/002_storage_images.sql     -- Storage para imagens
supabase/003_rls_documents.sql      -- RLS para documentos
supabase/004_document_versions.sql  -- Tabela + RLS para historico de versoes
```

### Desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Arquitetura

```
app/
  editor/
    NotionEditor.tsx          -- Componente principal (suporta readOnly)
    EditorProvider.tsx         -- Context + data source local
    types/index.ts             -- Tipos (BlockData, EditorConfig, etc.)
    components/
      Block.tsx                -- Bloco individual (suporta readOnly)
      Toolbar.tsx              -- Barra de ferramentas
      VersionHistory.tsx       -- Overlay de historico side-by-side
      TableBlock.tsx           -- Tabela editavel
      ImageBlock.tsx           -- Imagem com resize
      designBlocks/            -- Templates de design blocks
    hooks/
      useBlockManager.ts       -- CRUD de blocos
      usePagination.ts         -- Paginacao A4 com medicao DOM
      useVersionHistory.ts     -- Sessao + fetch + estado do historico
      useKeyboardShortcuts.ts  -- Atalhos de teclado
      useSectionNav.ts         -- Navegacao por secoes
    collaboration/
      useCollaborativeEditor.ts -- Hook principal (Yjs + Supabase + IndexedDB)
      supabase-provider.ts      -- Sync com Supabase Realtime
      yjs-sync.ts               -- Wrapper do Y.Doc
  page.tsx                     -- Pagina principal (demo)
supabase/
  001_documents.sql
  002_storage_images.sql
  003_rls_documents.sql
  004_document_versions.sql
```

## Seguranca

### Estado atual
- RLS habilitado nas tabelas `documents` e `document_versions` com politicas permissivas (`allow_all_for_now`)
- Modo readOnly bloqueia mutacoes no frontend (logica + CSS)

### Para producao com compartilhamento
Quando implementar autenticacao e niveis de permissao (editor/viewer), substitua as politicas permissivas por restritivas:

```sql
-- documents
CREATE POLICY "owner_select" ON documents FOR SELECT
  USING (owner_id = auth.uid()::text);
CREATE POLICY "owner_upsert" ON documents FOR ALL
  USING (owner_id = auth.uid()::text)
  WITH CHECK (owner_id = auth.uid()::text);

-- document_versions
CREATE POLICY "owner_select" ON document_versions FOR SELECT
  USING (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
CREATE POLICY "owner_insert" ON document_versions FOR INSERT
  WITH CHECK (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
```

Para usuarios com permissao somente leitura (viewer):
- Frontend: use `readOnly={true}` no `NotionEditor`
- Backend: RLS deve permitir apenas SELECT, bloqueando INSERT/UPDATE/DELETE
- Isso garante protecao em duas camadas (frontend + banco de dados)

## Props do NotionEditor

| Prop | Tipo | Descricao |
|------|------|-----------|
| `initialBlocks` | `BlockData[]` | Blocos iniciais |
| `dataSource` | `EditorDataSourceInterface` | Data source externo (Yjs) |
| `config` | `EditorConfig` | Configuracao (pagina, fontes, zoom, etc.) |
| `readOnly` | `boolean` | Modo somente leitura |
| `collaborationConfig` | `VersionHistoryCollabConfig` | Config Supabase para historico |
| `initialMeta` | `Record<string, unknown>` | Metadados iniciais (fonte, tamanho) |
| `onChange` | `(blocks) => void` | Callback de mudancas |
| `onSaveNow` | `() => Promise<void>` | Save manual (Ctrl+S) |
| `remoteUsers` | `PresenceUser[]` | Usuarios remotos |
| `syncStatus` | `SyncStatus` | Status de sincronizacao |
| `defaultViewMode` | `'paginated' \| 'continuous'` | Modo de visualizacao |
| `title` | `string` | Titulo na toolbar |
