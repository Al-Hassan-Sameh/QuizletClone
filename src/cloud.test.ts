import "fake-indexeddb/auto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, afterEach, it, expect, vi } from "vitest";
const transport = vi.hoisted(() => ({
  user: "test-user",
  remote: null as null | { revision: number; payload: unknown },
  rpc: vi.fn(),
  getUser: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: transport.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: transport.read, single: transport.read }),
      }),
    }),
    rpc: transport.rpc,
  }),
}));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  workspaceId: "test-user",
}));
import { db, exportBackup } from "./db";
import { blankSet, blankCard } from "./domain";
let api: typeof import("./cloud");
beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test-project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-test-key");
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
  api = await import("./cloud");
  api = {
    ...api,
    syncWorkspace: api.createWorkspaceSync(
      createClient("https://test-project.supabase.co", "public-test-key"),
      "test-user",
    ),
  };
});
beforeEach(async () => {
  for (const table of db.tables) await table.clear();
  transport.remote = null;
  transport.getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "test-user" } }, error: null });
  transport.read
    .mockReset()
    .mockImplementation(async () => ({ data: transport.remote, error: null }));
  transport.rpc.mockReset().mockImplementation(async (_name, args) => {
    if (args.expected_revision !== (transport.remote?.revision || 0))
      return { data: null, error: null };
    const rev = (transport.remote?.revision || 0) + 1;
    transport.remote = { revision: rev, payload: args.snapshot };
    return { data: rev, error: null };
  });
});
afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
});
it("uploads, persists a baseline and pulls newer remote data without losing local edits", async () => {
  await db.notes.put({
    id: "n",
    title: "Offline note",
    body: "Local",
    topic: "",
    setId: "",
    updated: 1,
  });
  expect(await api.syncWorkspace()).toBe("All changes synchronized");
  expect(transport.remote?.revision).toBe(1);
  const remote = await exportBackup();
  remote.platform.notes[0].body = "Remote edit";
  transport.remote = { revision: 2, payload: remote };
  expect(await api.syncWorkspace()).toBe("Downloaded cloud changes");
  expect((await db.notes.get("n"))?.body).toBe("Remote edit");
  expect((await api.readSync()).revision).toBe(2);
});
it("keeps an offline queue and retries after connectivity returns", async () => {
  await db.notes.put({
    id: "n",
    title: "Note",
    body: "Offline",
    topic: "",
    setId: "",
    updated: 1,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: false },
    configurable: true,
  });
  await api.queueWorkspace();
  expect((await api.readSync()).pending).toContain("Offline");
  await expect(api.syncWorkspace()).rejects.toThrow("Offline");
  expect(transport.rpc).not.toHaveBeenCalled();
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
  await api.syncWorkspace();
  expect((await api.readSync()).pending).toBeNull();
});
it("surfaces transport failures and retains pending changes for retry", async () => {
  const s = {
    ...blankSet(),
    title: "Keep me",
    cards: [{ ...blankCard(), term: "Q", definition: "A" }],
  };
  await db.sets.put(s);
  transport.read.mockResolvedValueOnce({
    data: null,
    error: new Error("Network failed"),
  });
  await expect(api.syncWorkspace()).rejects.toThrow("Network failed");
  expect((await api.readSync()).pending).toContain("Keep me");
  expect(await db.sets.get(s.id)).toEqual(s);
  await api.syncWorkspace();
  expect((await api.readSync()).pending).toBeNull();
});
it("prevents cross-account uploads even when a different local workspace is selected", async () => {
  transport.getUser.mockResolvedValue({
    data: { user: { id: "other-user" } },
    error: null,
  });
  await expect(api.syncWorkspace()).rejects.toThrow("this workspace account");
  expect(transport.read).not.toHaveBeenCalled();
  expect(transport.rpc).not.toHaveBeenCalled();
});
it("preserves both versions during explicit conflict resolution", async () => {
  await db.notes.put({
    id: "n",
    title: "Note",
    body: "Baseline",
    topic: "",
    setId: "",
    updated: 1,
  });
  await api.syncWorkspace();
  const remote = await exportBackup();
  remote.platform.notes[0].body = "Remote";
  transport.remote = { revision: 2, payload: remote };
  await db.notes.update("n", { body: "Local" });
  expect(await api.syncWorkspace()).toContain("Conflict");
  expect((await db.notes.get("n"))?.body).toBe("Local");
  expect(transport.remote.payload).toEqual(remote);
  await api.syncWorkspace("remote");
  expect((await db.notes.get("n"))?.body).toBe("Remote");
  const recovery = await db.syncState
    .filter((r) => r.id.startsWith("recovery:"))
    .first();
  expect(recovery?.value).toContain("Local");
  expect(recovery?.value).toContain("Remote");
});
it("queues edits arriving during upload instead of treating them as synchronized", async () => {
  await db.notes.put({
    id: "n",
    title: "Note",
    body: "Before",
    topic: "",
    setId: "",
    updated: 1,
  });
  transport.rpc.mockImplementationOnce(async (_name, args) => {
    await db.notes.update("n", { body: "During request" });
    transport.remote = { revision: 1, payload: args.snapshot };
    return { data: 1, error: null };
  });
  expect(await api.syncWorkspace()).toContain("queued");
  expect((await api.readSync()).pending).toContain("During request");
  await api.syncWorkspace();
  expect((await api.readSync()).pending).toBeNull();
  expect(JSON.stringify(transport.remote)).toContain("During request");
});
