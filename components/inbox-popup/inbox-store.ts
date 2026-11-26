'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { markInboxItem, subscribeToInbox, type InboxItem } from '@/lib/inbox';
import { setCheckpoint } from '@/lib/checkpoints';

/*
 * The signed-in user's unread inbox, shared by the desktop reminder stack
 * (inbox-popup.tsx) and the phone top bar's bell + Notifications sheet
 * (notifications-bell.tsx).
 *
 * One Firestore listener however many components read it: each reader
 * registers the uid it wants while it's mounted, the listener follows the
 * newest registration (they all read the same auth user) and closes when the
 * last reader goes. Changes are reconciled on a microtask, so a reader that
 * unmounts and mounts again in the same tick (Strict Mode, a user switch)
 * never tears the listener down and back up.
 */

export interface InboxState {
  /** Whose inbox this is (null when signed out). */
  uid: string | null;
  /** Unread items, newest first. */
  items: readonly InboxItem[];
  /** False until the first snapshot for `uid` has arrived (or the listener failed). */
  loaded: boolean;
  /** True when the listener died (permissions, network); `loaded` is true then too. See `retryInbox`. */
  failed: boolean;
  /** Items with a Watched / Dismiss write in flight. */
  acting: ReadonlySet<string>;
}

const NO_ITEMS: readonly InboxItem[] = [];
const NOT_ACTING: ReadonlySet<string> = new Set();
const SIGNED_OUT: InboxState = { uid: null, items: NO_ITEMS, loaded: false, failed: false, acting: NOT_ACTING };

let state: InboxState = SIGNED_OUT;
const listeners = new Set<() => void>();
const readers = new Map<number, string>();
let nextReaderId = 0;
let listeningTo: string | null = null;
let stopListening: (() => void) | null = null;
let reconcileQueued = false;

function setState(next: InboxState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function reconcile(): void {
  reconcileQueued = false;
  let wanted: string | null = null;
  for (const uid of readers.values()) wanted = uid; // insertion order: newest last
  if (wanted === listeningTo) return;

  stopListening?.();
  stopListening = null;
  listeningTo = wanted;
  setState(wanted ? { uid: wanted, items: NO_ITEMS, loaded: false, failed: false, acting: NOT_ACTING } : SIGNED_OUT);
  if (!wanted) return;
  stopListening = listen(wanted);
}

function listen(uid: string): () => void {
  return subscribeToInbox(
    uid,
    (items) => {
      if (listeningTo === uid) setState({ ...state, items, loaded: true, failed: false });
    },
    () => {
      // Keep whatever was already showing; readers decide how to surface it.
      if (listeningTo === uid) setState({ ...state, loaded: true, failed: true });
    }
  );
}

/** After a failed listener (`failed`), connect again — e.g. when the user opens the inbox. No-op otherwise. */
export function retryInbox(): void {
  if (!state.failed || !listeningTo) return;
  const uid = listeningTo;
  stopListening?.();
  setState({ ...state, loaded: false, failed: false });
  stopListening = listen(uid);
}

function queueReconcile(): void {
  if (reconcileQueued) return;
  reconcileQueued = true;
  queueMicrotask(reconcile);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => SIGNED_OUT;

/** The inbox of `uid` (pass the signed-in user's uid, or nothing when signed out). */
export function useInbox(uid: string | null | undefined): InboxState {
  useEffect(() => {
    if (!uid) return;
    const id = nextReaderId++;
    readers.set(id, uid);
    queueReconcile();
    return () => {
      readers.delete(id);
      queueReconcile();
    };
  }, [uid]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Never hand out another account's items while the listener catches up.
  return uid && snapshot.uid === uid ? snapshot : SIGNED_OUT;
}

function setActing(uid: string, id: string, on: boolean): void {
  if (state.uid !== uid || state.acting.has(id) === on) return;
  const acting = new Set(state.acting);
  if (on) acting.add(id);
  else acting.delete(id);
  setState({ ...state, acting });
}

/**
 * Watched (TV): moves the show's checkpoint to this episode, then clears the
 * item. The caller plays the haptic, synchronously inside the tap.
 * Resolves false only when the write failed (the item stays in the inbox).
 */
export async function confirmInboxItem(uid: string, item: InboxItem): Promise<boolean> {
  if (item.type !== 'tv') return false;
  if (state.acting.has(item.id)) return true; // already on its way
  setActing(uid, item.id, true);
  try {
    await setCheckpoint(uid, item.reminderId, item.season, item.episode);
    await markInboxItem(uid, item.id, 'confirmed');
    return true;
  } catch (e) {
    console.error('Error confirming inbox item', e);
    return false;
  } finally {
    setActing(uid, item.id, false);
  }
}

/**
 * Dismiss: clears the item without touching the checkpoint.
 * Resolves false only when the write failed (the item stays in the inbox).
 */
export async function dismissInboxItem(uid: string, item: InboxItem): Promise<boolean> {
  if (state.acting.has(item.id)) return true; // already on its way
  setActing(uid, item.id, true);
  try {
    await markInboxItem(uid, item.id, 'dismissed');
    return true;
  } catch (e) {
    console.error('Error dismissing inbox item', e);
    return false;
  } finally {
    setActing(uid, item.id, false);
  }
}

export type ShownItem = { item: InboxItem; leaving: boolean };

/**
 * Mirrors `items`, keeping ones that left (at their old position, flagged
 * `leaving`) for `leaveMs` so they can animate out.
 */
export function useLeavingItems(items: readonly InboxItem[], leaveMs: number): ShownItem[] {
  const [shown, setShown] = useState<ShownItem[]>(() => items.map((item) => ({ item, leaving: false })));

  useEffect(() => {
    setShown((prev) => {
      const ids = new Set(items.map((item) => item.id));
      const next: ShownItem[] = items.map((item) => ({ item, leaving: false }));
      prev.forEach((entry, index) => {
        if (!ids.has(entry.item.id)) {
          next.splice(Math.min(index, next.length), 0, { item: entry.item, leaving: true });
        }
      });
      return next;
    });
  }, [items]);

  const leavingKey = shown
    .filter((entry) => entry.leaving)
    .map((entry) => entry.item.id)
    .join(',');

  useEffect(() => {
    if (!leavingKey) return;
    const timer = window.setTimeout(
      () => setShown((prev) => prev.filter((entry) => !entry.leaving)),
      leaveMs + 40
    );
    return () => window.clearTimeout(timer);
  }, [leavingKey, leaveMs]);

  return shown;
}
