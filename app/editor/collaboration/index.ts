// =============================================================================
// Collaboration Module
// =============================================================================
// Integra Yjs (CRDT) + Supabase (Realtime + persistência) + IndexedDB (offline)
//
// Uso:
//   import { useCollaborativeEditor, RemoteCursorsOverlay, SyncStatusBadge } from './editor/collaboration';
//
//   const { dataSource, remoteUsers, syncStatus } = useCollaborativeEditor({
//     config: {
//       supabaseUrl: 'https://xxx.supabase.co',
//       supabaseAnonKey: 'your-anon-key',
//       documentId: 'doc-123',
//       user: { id: 'user-1', name: 'André', color: '#3b82f6' },
//     },
//   });
//
//   <NotionEditor dataSource={dataSource} />
//   <RemoteCursorsOverlay remoteUsers={remoteUsers} />
//   <SyncStatusBadge status={syncStatus} />
//
// O cursor tracking é automático — não precisa passar nenhum callback.
// =============================================================================

export { useCollaborativeEditor } from './useCollaborativeEditor';
export { RemoteCursorsOverlay, SyncStatusBadge } from './RemoteCursors';
export { getSupabaseClient } from './supabase-client';
export { uploadImage, uploadBase64Image } from './image-upload';
export type { CollaborationConfig, CollaborationUser, RemoteUser, SyncStatus, CursorPosition } from './types';
