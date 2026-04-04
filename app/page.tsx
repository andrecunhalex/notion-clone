'use client';

import { useCallback } from 'react';
import {
  NotionEditor,
  useCollaborativeEditor,
  RemoteCursorsOverlay,
} from './editor';
import { getSupabaseClient, uploadImage } from './editor/collaboration';

// ---------------------------------------------------------------------------
// Set these env vars in .env.local to enable collaboration:
//   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_COLLAB = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
const sessionUserId = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const DOC_ID = 'demo-doc';

export default function Home() {
  if (HAS_COLLAB) {
    return <CollaborativeEditor />;
  }

  return (
    <NotionEditor
      title="MiniNotion"
      defaultViewMode="paginated"
      onChange={(blocks) => {
        console.log('Blocos atualizados:', blocks.length);
      }}
    />
  );
}

function CollaborativeEditor() {
  const { dataSource, remoteUsers, syncStatus, saveNow } = useCollaborativeEditor({
    config: {
      supabaseUrl: SUPABASE_URL!,
      supabaseAnonKey: SUPABASE_ANON_KEY!,
      documentId: DOC_ID,
      user: {
        id: sessionUserId,
        name: `User ${sessionUserId.slice(0, 4)}`,
        color: randomColor,
      },
    },
  });

  // Image uploader using Supabase Storage
  const handleUploadImage = useCallback(async (file: File) => {
    const supabase = getSupabaseClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    return uploadImage(supabase, DOC_ID, file);
  }, []);

  return (
    <>
      <NotionEditor
        title="MiniNotion Collab"
        defaultViewMode="paginated"
        dataSource={dataSource}
        remoteUsers={remoteUsers}
        syncStatus={syncStatus}
        onSaveNow={saveNow}
        config={{ 
          uploadImage: handleUploadImage,
          sectionNav: {
            position: 'header',
            pages: 'all',
            maxButtons: 5,
            activeColor: '#7c3aed',
            maxLabelLength: 12,
            buttonTemplate: {
              activeHtml: `<div class="bg-purple-600 rounded-lg px-4 py-2 flex items-center gap-2 shadow-md"><span class="text-white text-xs">{{label}}</span></div>`,
              inactiveHtml: `<div class="bg-gray-50 rounded-full px-3 py-1 border border-gray-200"><span class="text-gray-400 text-xs">{{label}}</span></div>`,
            }
          },
          page: {
            paddingBottom: 150,
            paddingTop: 40,
            paddingLeft: 70,
            paddingRight: 70,
          }
        }}
      />
      <RemoteCursorsOverlay remoteUsers={remoteUsers} />
    </>
  );
}
