import * as Y from 'yjs';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';
import { CollaborationConfig, CursorPosition, RemoteUser, SyncStatus } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  // Use chunk-based approach to avoid stack overflow on large arrays
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Batch Yjs updates before broadcasting (reduces messages/sec) */
const BROADCAST_BATCH_MS = 300;
/** Debounce persistence saves (reduces DB writes + egress) */
const SAVE_DEBOUNCE_MS = 5000;
/** Cursor position sent via Broadcast, not Presence (higher limits) */
const CURSOR_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// SupabaseProvider — optimized for Supabase Pro limits
//
// Key optimizations vs naive approach:
// 1. SOLO MODE: no broadcasts (Yjs updates or cursors) when user is alone.
//    When a peer joins, full state is sent so they catch up instantly.
// 2. Yjs updates are BATCHED (300ms window) before broadcast → fewer messages
// 3. Cursor uses Broadcast (500 msg/sec limit) instead of Presence (50/sec)
// 4. Presence only tracks online/offline (rarely changes)
// 5. DB save debounce increased to 5s
// 6. Cursor deduplication: only sends when position actually changed
// ---------------------------------------------------------------------------

export class SupabaseProvider {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private doc: Y.Doc;
  private config: CollaborationConfig;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: SyncStatus = 'disconnected';
  private _onStatusChange: ((status: SyncStatus) => void) | null = null;
  private _onRemoteUsersChange: ((users: RemoteUser[]) => void) | null = null;
  private _destroyed = false;

  // Batching state for Yjs updates
  private _pendingUpdates: Uint8Array[] = [];
  private _batchTimer: ReturnType<typeof setTimeout> | null = null;

  // Cursor deduplication
  private _lastCursorJson = '';
  private _cursorTimer: ReturnType<typeof setTimeout> | null = null;

  // StateVector for incremental saves
  private _lastSavedStateVector: Uint8Array | null = null;

  // beforeunload handler reference
  private _beforeUnloadHandler: (() => void) | null = null;

  // Solo-mode: skip broadcasts when no one else is in the document
  private _hasRemotePeers = false;

  // Remote users: merge Presence (online/offline) + Broadcast (cursor position)
  private _presenceUsers = new Map<string, { name: string; color: string }>();
  private _remoteCursors = new Map<string, CursorPosition | null>();

  constructor(doc: Y.Doc, config: CollaborationConfig) {
    this.doc = doc;
    this.config = config;
    this.supabase = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);

    this.channel = this.supabase.channel(`doc:${config.documentId}`, {
      config: { broadcast: { self: false } },
    });

    this._setup();
  }

  get status(): SyncStatus { return this._status; }

  onStatusChange(cb: (status: SyncStatus) => void) { this._onStatusChange = cb; }
  onRemoteUsersChange(cb: (users: RemoteUser[]) => void) { this._onRemoteUsersChange = cb; }

  /** Debounced + deduplicated cursor broadcast (skipped in solo mode) */
  trackCursor(cursor: CursorPosition | null) {
    if (this._destroyed || !this._hasRemotePeers) return;

    const json = cursor ? JSON.stringify(cursor) : '';
    // Skip if position didn't change
    if (json === this._lastCursorJson) return;
    this._lastCursorJson = json;

    // Debounce cursor broadcasts
    if (this._cursorTimer) clearTimeout(this._cursorTimer);
    this._cursorTimer = setTimeout(() => {
      if (!this._hasRemotePeers) return;
      this.channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: {
          user_id: this.config.user.id,
          cursor: json || null,
        },
      });
    }, CURSOR_DEBOUNCE_MS);
  }

  async saveNow(): Promise<void> {
    if (this._destroyed) return;
    this._flushBatch();
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    await this._persistToSupabase();
  }

  destroy() {
    this._destroyed = true;
    this._flushBatch();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this._cursorTimer) clearTimeout(this._cursorTimer);
    if (this._beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
    this.doc.off('update', this._onDocUpdate);
    this.channel.untrack();
    this.channel.unsubscribe();
    this._persistToSupabase().catch(() => {});
  }

  // --- Internal ---

  private _setStatus(status: SyncStatus) {
    this._status = status;
    this._onStatusChange?.(status);
  }

  private async _setup() {
    this._setStatus('connecting');

    this.channel
      // Yjs document updates
      .on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
        if (this._destroyed) return;
        try {
          const update = base64ToUint8(payload.update);
          Y.applyUpdate(this.doc, update, 'remote');
        } catch { /* ignore malformed */ }
      })
      // Remote cursor positions (via Broadcast — high throughput)
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (this._destroyed) return;
        const userId = payload.user_id as string;
        if (userId === this.config.user.id) return;

        let cursor: CursorPosition | null = null;
        if (payload.cursor) {
          try { cursor = JSON.parse(payload.cursor as string); } catch { /* ignore */ }
        }
        this._remoteCursors.set(userId, cursor);
        this._emitRemoteUsers();
      })
      // Presence: only online/offline status (rarely changes — low message rate)
      .on('presence', { event: 'sync' }, () => this._syncPresence())
      .on('presence', { event: 'join' }, () => this._syncPresence())
      .on('presence', { event: 'leave' }, () => this._syncPresence());

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this._setStatus('connected');
        await this._loadFromSupabase();
        this._setStatus('synced');
        // Track presence (only user info, no cursor — sent rarely)
        this.channel.track({
          user_id: this.config.user.id,
          name: this.config.user.name,
          color: this.config.user.color,
        });
      }
    });

    this.doc.on('update', this._onDocUpdate);

    // Clean up presence immediately when tab closes
    if (typeof window !== 'undefined') {
      this._beforeUnloadHandler = () => {
        this.channel.untrack();
        this.channel.unsubscribe();
      };
      window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }
  }

  /** Batch Yjs updates: collect over BROADCAST_BATCH_MS, then send as one merged update */
  private _onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (this._destroyed) return;
    if (origin === 'remote' || origin === 'supabase-load') return;

    // Always persist to DB, but only broadcast when peers are present
    this._debouncedSave();

    if (!this._hasRemotePeers) return;

    this._pendingUpdates.push(update);

    if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => {
        this._flushBatch();
      }, BROADCAST_BATCH_MS);
    }
  };

  private _flushBatch() {
    if (this._batchTimer) { clearTimeout(this._batchTimer); this._batchTimer = null; }
    if (this._pendingUpdates.length === 0) return;

    const updates = this._pendingUpdates;
    this._pendingUpdates = [];

    // Merge all pending updates into one before broadcasting
    try {
      const merged = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
      this.channel.send({
        type: 'broadcast',
        event: 'yjs-update',
        payload: { update: uint8ToBase64(merged) },
      });
    } catch {
      // Fallback: send updates individually
      for (const update of updates) {
        this.channel.send({
          type: 'broadcast',
          event: 'yjs-update',
          payload: { update: uint8ToBase64(update) },
        });
      }
    }
  }

  private _debouncedSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this._persistToSupabase().catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }

  private async _loadFromSupabase() {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('yjs_state')
        .eq('id', this.config.documentId)
        .maybeSingle();
      if (error) throw error;
      if (data?.yjs_state) {
        const update = base64ToUint8(data.yjs_state);
        Y.applyUpdate(this.doc, update, 'supabase-load');
      }
      // Snapshot the stateVector after loading — used for incremental saves
      this._lastSavedStateVector = Y.encodeStateVector(this.doc);
    } catch (err) {
      console.warn('[collaboration] Failed to load from Supabase:', err);
    }
  }

  private async _persistToSupabase() {
    try {
      // Skip save if nothing changed since last persistence
      const currentVector = Y.encodeStateVector(this.doc);
      if (this._lastSavedStateVector) {
        const diff = Y.encodeStateAsUpdate(this.doc, this._lastSavedStateVector);
        // Yjs diff with no changes produces a small header (~4 bytes). Skip if trivial.
        if (diff.length <= 4) return;
      }

      const fullState = Y.encodeStateAsUpdate(this.doc);
      const { error } = await this.supabase
        .from('documents')
        .upsert({
          id: this.config.documentId,
          yjs_state: uint8ToBase64(fullState),
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      this._lastSavedStateVector = currentVector;
    } catch (err) {
      console.warn('[collaboration] Failed to save to Supabase:', err);
    }
  }

  /** Sync presence state and toggle solo mode */
  private _syncPresence() {
    const state = this.channel.presenceState();
    const hadPeers = this._hasRemotePeers;
    this._presenceUsers.clear();

    for (const presences of Object.values(state)) {
      for (const p of presences as Record<string, unknown>[]) {
        const userId = p.user_id as string;
        if (userId === this.config.user.id) continue;
        this._presenceUsers.set(userId, {
          name: p.name as string,
          color: p.color as string,
        });
      }
    }

    this._hasRemotePeers = this._presenceUsers.size > 0;

    // Peer just joined: send full state so they catch up on edits made in solo mode
    if (this._hasRemotePeers && !hadPeers) {
      this._broadcastFullState();
    }

    // Reset cursor dedup when entering solo mode so next collab session starts fresh
    if (!this._hasRemotePeers && hadPeers) {
      this._lastCursorJson = '';
    }

    // Clean up cursors for users who left
    for (const userId of this._remoteCursors.keys()) {
      if (!this._presenceUsers.has(userId)) {
        this._remoteCursors.delete(userId);
      }
    }

    this._emitRemoteUsers();
  }

  /** Send full Yjs state so a newly-joined peer can catch up */
  private _broadcastFullState() {
    try {
      const fullState = Y.encodeStateAsUpdate(this.doc);
      this.channel.send({
        type: 'broadcast',
        event: 'yjs-update',
        payload: { update: uint8ToBase64(fullState) },
      });
    } catch {
      // Non-critical — peer will load from DB as fallback
    }
  }

  /** Merge presence (who's online) + cursor broadcasts (where they are) */
  private _emitRemoteUsers() {
    if (!this._onRemoteUsersChange) return;

    const users: RemoteUser[] = [];
    for (const [userId, info] of this._presenceUsers) {
      users.push({
        id: userId,
        name: info.name,
        color: info.color,
        cursor: this._remoteCursors.get(userId) || null,
      });
    }

    this._onRemoteUsersChange(users);
  }
}
