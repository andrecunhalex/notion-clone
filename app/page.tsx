'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  NotionEditor,
  useCollaborativeEditor,
} from './editor';
import { getSupabaseClient, uploadImage } from './editor/collaboration';

// ---------------------------------------------------------------------------
// Set these env vars in .env.local to enable collaboration:
//   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
//
// For RLS to work end-to-end you also need to enable Anonymous Sign-Ins
// in the Supabase dashboard:
//   Authentication → Providers → Anonymous → Enable
// (Or replace the anon-sign-in below with email / OAuth when you wire up
//  real auth.)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_COLLAB = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];

const DOC_ID = 'demo-doc';
// Mocked while the real workspace model isn't wired up — every design-library
// resource is scoped to this id alongside DOC_ID. Replace with a real
// workspace id from your auth/membership context.
const WORKSPACE_ID = 'demo-workspace';

// ---------------------------------------------------------------------------
// useAnonSession — sign in anonymously on mount, return the live session
// ---------------------------------------------------------------------------
// Resolution flow:
//   1. Check for an existing session in storage (returning user)
//   2. If none, call signInAnonymously() to mint a new auth.users row
//   3. Subscribe to onAuthStateChange so token refreshes are picked up
//
// The returned session.user.id is a real Supabase auth.uid() that RLS
// policies can match against workspace_members. When you upgrade to email
// or OAuth login later, this hook becomes unnecessary — the auth flow will
// produce a real session via supabase.auth.signInWith*.
// ---------------------------------------------------------------------------

function useAnonSession(url: string, anonKey: string): Session | null | 'pending' {
  const [session, setSession] = useState<Session | null | 'pending'>('pending');

  useEffect(() => {
    const client = getSupabaseClient(url, anonKey);
    let cancelled = false;

    async function bootstrap() {
      const { data: existing } = await client.auth.getSession();
      if (cancelled) return;
      if (existing.session) {
        setSession(existing.session);
        return;
      }
      const { data: signed, error } = await client.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        // Most common cause: anonymous sign-ins not enabled in the dashboard.
        console.error('[auth] signInAnonymously failed', error);
        setSession(null);
        return;
      }
      if (signed.session) setSession(signed.session);
    }

    bootstrap();

    const { data: sub } = client.auth.onAuthStateChange((_event, sess) => {
      if (!cancelled) setSession(sess ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [url, anonKey]);

  return session;
}

// ---------------------------------------------------------------------------
// Page entrypoint
// ---------------------------------------------------------------------------

export default function Home() {
  if (HAS_COLLAB) {
    return <CollaborativeEditor />;
  }

  // Local-only fallback when env vars aren't set — uses random ids since
  // there's no real auth in this branch.
  const localUserId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return (
    <NotionEditor
      title="MiniNotion"
      defaultViewMode="paginated"
      config={{ enableComments: true }}
      commentUser={{ id: localUserId, name: `User ${localUserId.slice(0, 4)}` }}
      initialMeta={{
        pageBackground: {
          defaultImage: 'https://yiqxeiqsfmbiwycfjxaq.supabase.co/storage/v1/object/public/images/uploads/1761055623347_CapaDemo.png',
        },
      }}
      onChange={(blocks) => {
        console.log('Blocos atualizados:', blocks.length);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// CollaborativeEditor — gated by anon session ready
// ---------------------------------------------------------------------------

function CollaborativeEditor() {
  const session = useAnonSession(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  // Image uploader using Supabase Storage. Doesn't depend on session.
  const handleUploadImage = useCallback(async (file: File) => {
    const supabase = getSupabaseClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    return uploadImage(supabase, DOC_ID, file);
  }, []);

  if (session === 'pending') {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-gray-400">
        Conectando...
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-sm text-gray-600 gap-2 px-6 text-center">
        <div className="text-base font-semibold">Falha na autenticação</div>
        <div className="text-xs text-gray-500 max-w-md">
          Não foi possível iniciar uma sessão anônima. Verifique se Anonymous Sign-Ins está
          habilitado em Authentication → Providers → Anonymous no painel do Supabase.
        </div>
      </div>
    );
  }

  // Session is ready — use the real auth.uid() everywhere
  return (
    <ReadyEditor
      session={session}
      handleUploadImage={handleUploadImage}
    />
  );
}

interface ReadyEditorProps {
  session: Session;
  handleUploadImage: (file: File) => Promise<string | null>;
}

function ReadyEditor({ session, handleUploadImage }: ReadyEditorProps) {
  const userId = session.user.id;
  const userName = `User ${userId.slice(0, 4)}`;

  const { dataSource, remoteUsers, syncStatus, saveNow } = useCollaborativeEditor({
    config: {
      supabaseUrl: SUPABASE_URL!,
      supabaseAnonKey: SUPABASE_ANON_KEY!,
      documentId: DOC_ID,
      user: {
        id: userId,
        name: userName,
        color: randomColor,
      },
    },
  });

  return (
    <NotionEditor
      title="MiniNotion Collab"
      defaultViewMode="paginated"
      dataSource={dataSource}
      remoteUsers={remoteUsers}
      syncStatus={syncStatus}
      onSaveNow={saveNow}
      collaborationConfig={{
        supabaseUrl: SUPABASE_URL!,
        supabaseAnonKey: SUPABASE_ANON_KEY!,
        documentId: DOC_ID,
        user: { id: userId, name: userName, color: randomColor },
      }}
      designLibraryConfig={{
        supabaseUrl: SUPABASE_URL!,
        supabaseAnonKey: SUPABASE_ANON_KEY!,
        workspaceId: WORKSPACE_ID,
        documentId: DOC_ID,
        userId,
      }}
      commentUser={{ id: userId, name: userName }}
      initialMeta={{
        pageBackground: {
          defaultImage: 'https://lexstudio.ai/A4_Lex_1.svg',
          overrides: {
            1: null,
          },
        },
      }}
      config={{
        uploadImage: handleUploadImage,
        enableVersionHistory: true,
        enableComments: true,
        sectionNav: {
          position: 'header',
          pages: 'all',
          maxButtons: 5,
          activeColor: '#7c3aed',
          maxLabelLength: 12,
          buttonTemplate: {
            activeHtml: `<div class="bg-purple-600 rounded-lg px-4 py-2 flex items-center gap-2 shadow-md"><span class="text-white text-xs">{{label}}</span></div>`,
            inactiveHtml: `<div class="bg-gray-50 rounded-full px-3 py-1 border border-gray-200"><span class="text-gray-400 text-xs">{{label}}</span></div>`,
          },
        },
        page: {
          paddingBottom: 150,
          paddingTop: 40,
          paddingLeft: 70,
          paddingRight: 70,
        },
      }}
    />
  );
}
