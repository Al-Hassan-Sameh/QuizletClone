/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db, exportBackup, restoreBackup, workspaceId } from "./db";
import { validateBackup } from "./domain";
const config = (
  import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
export const cloud =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          auth: {
            flowType: "pkce",
            detectSessionInUrl: true,
            autoRefreshToken: true,
            persistSession: true,
          },
        },
      )
    : null;
export const redirectUrl = () =>
  new URL(config.BASE_URL || "/", location.origin).href;
export interface RemoteSnapshot {
  revision: number;
  payload: ReturnType<typeof validateBackup>;
}
export interface SyncState {
  revision: number;
  baseline: string;
  pending: string | null;
  conflict: RemoteSnapshot | null;
  lastSync: number;
}
export const initialSync = (): SyncState => ({
  revision: 0,
  baseline: "",
  pending: null,
  conflict: null,
  lastSync: 0,
});
// Canonical snapshots avoid false conflicts when IndexedDB key traversal differs.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function decideSync(
  local: string,
  state: SyncState,
  remote: RemoteSnapshot | null,
): "push" | "pull" | "conflict" | "clean" {
  const remoteChanged = (remote?.revision || 0) !== state.revision;
  const localChanged = local !== state.baseline;
  if (remote && canonical(remote.payload) === local) return "clean";
  if (remoteChanged && localChanged) return "conflict";
  if (remoteChanged) return "pull";
  return localChanged ? "push" : "clean";
}
export async function readSync(): Promise<SyncState> {
  const row = await db.syncState.get("state");
  return row ? JSON.parse(row.value) : initialSync();
}
async function saveSync(state: SyncState) {
  await db.syncState.put({ id: "state", value: JSON.stringify(state) });
}
export async function queueWorkspace() {
  if (running) return;
  const state = await readSync();
  const text = canonical(await exportBackup());
  state.pending = text !== state.baseline ? text : null;
  await saveSync(state);
}
let running = false;
export function createWorkspaceSync(
  client: SupabaseClient | null,
  accountId: string,
) {
  return async function syncWorkspace(
    resolve?: "local" | "remote",
  ): Promise<string> {
    if (running) return "Synchronization already running";
    if (!client)
      throw new Error("Configure Supabase to enable account synchronization.");
    if (!navigator.onLine)
      throw new Error("Offline · changes remain queued on this device.");
    running = true;
    try {
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError || !user || user.id !== accountId)
        throw new Error("Sign in to this workspace account before syncing.");
      const state = await readSync();
      const local = await exportBackup();
      const localText = canonical(local);
      state.pending = localText !== state.baseline ? localText : null;
      await saveSync(state);
      const { data, error } = await client
        .from("learning_snapshots")
        .select("revision,payload")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const remote = data
        ? { revision: data.revision, payload: validateBackup(data.payload) }
        : null;
      let action = decideSync(localText, state, remote);
      if (resolve && state.conflict) {
        // Always re-read remote before resolution. Keep both full versions locally for recovery.
        await db.syncState.put({
          id: `recovery:${Date.now()}`,
          value: JSON.stringify({ local, remote }),
        });
        if (resolve === "local") {
          state.revision = remote?.revision || 0;
          action = "push";
        } else action = "pull";
      }
      if (action === "conflict") {
        state.conflict = remote;
        await saveSync(state);
        return "Conflict · choose which version to keep. Both versions are preserved.";
      }
      if (action === "pull") {
        if (!remote) throw new Error("Cloud snapshot is unavailable.");
        // Detect edits made while the remote request was in flight.
        if (canonical(await exportBackup()) !== localText) {
          state.conflict = remote;
          await saveSync(state);
          return "Conflict · local changes were made while downloading.";
        }
        // Include read/write tables and sync state in one transaction to serialize concurrent local writes.
        await db.transaction("rw", db.tables, async () => {
          if (canonical(await exportBackup()) !== localText)
            throw new Error(
              "Local changes arrived during sync. Retry to resolve safely.",
            );
          await restoreBackup(remote.payload);
          state.revision = remote.revision;
          state.baseline = canonical(await exportBackup());
          state.pending = null;
          state.conflict = null;
          state.lastSync = Date.now();
          await saveSync(state);
        });
        return "Downloaded cloud changes";
      }
      if (action === "push") {
        const { data: revision, error: writeError } = await client.rpc(
          "save_learning_snapshot",
          { expected_revision: state.revision, snapshot: local },
        );
        if (writeError) throw writeError;
        if (revision === null) {
          const { data: newer, error: newError } = await client
            .from("learning_snapshots")
            .select("revision,payload")
            .eq("user_id", user.id)
            .single();
          if (newError) throw newError;
          state.conflict = {
            revision: newer.revision,
            payload: validateBackup(newer.payload),
          };
          await saveSync(state);
          return "Conflict · another device updated your library.";
        }
        state.revision = revision;
        state.baseline = localText;
        state.pending =
          canonical(await exportBackup()) !== localText
            ? canonical(await exportBackup())
            : null;
      } else {
        state.revision = remote?.revision || 0;
        state.baseline = localText;
        state.pending = null;
      }
      state.conflict = null;
      state.lastSync = Date.now();
      await saveSync(state);
      return state.pending
        ? "New edits queued for the next sync"
        : "All changes synchronized";
    } finally {
      running = false;
    }
  };
}
export const syncWorkspace = createWorkspaceSync(cloud, workspaceId);
