import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloud, redirectUrl, syncWorkspace, queueWorkspace } from "./cloud";
import {
  db,
  download,
  exportBackup,
  importGuestWorkspace,
  workspaceId,
} from "./db";
import { useLiveQuery } from "dexie-react-hooks";
export function Account() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("Sign in");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = useLiveQuery(() => db.syncState.get("state"));
  const state = sync ? JSON.parse(sync.value) : null;
  const recovery = useLiveQuery(() => db.syncState.toArray()) || [];
  const sessions = useLiveQuery(() => db.sessions.count()) || 0;
  const attempts = useLiveQuery(() => db.attempts.count()) || 0;
  useEffect(() => {
    if (!cloud) return;
    void cloud.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setUser(data.session?.user || null);
    });
    const { data } = cloud.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") setMode("New password");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function run(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (message) setStatus(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function switchWorkspace(id: string) {
    localStorage.setItem("recall-workspace", id);
    location.reload();
  }
  async function importGuest() {
    const skipped = await importGuestWorkspace();
    setStatus(
      `Guest library and history imported. ${skipped ? `${skipped} conflicting draft(s) remain safely in the guest workspace.` : "Guest data remains unchanged."}`,
    );
  }

  return (
    <div className="platform-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR KNOWLEDGE, WHEREVER YOU GO</div>
          <h1>Account profile</h1>
          <p>Study as a guest offline, or connect a private cloud workspace.</p>
        </div>
      </div>
      {!cloud && (
        <section className="panel">
          <h2>Offline guest workspace</h2>
          <p>
            Accounts are not configured for this installation. Your local
            library works without signing in. To enable email and Google
            authentication, configure the public Supabase project URL and
            publishable key as described in docs/ACCOUNTS.md.
          </p>
        </section>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {cloud && !user && (
        <section className="panel account-panel">
          <h2>{mode}</h2>
          <button
            className="google-button secondary"
            disabled={busy || !navigator.onLine}
            onClick={() =>
              void run(async () => {
                const { error } = await cloud!.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: redirectUrl() },
                });
                if (error) throw error;
              })
            }
          >
            Continue with Google
          </button>
          <p>or use your email address</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (mode === "Reset password") {
                  const { error } = await cloud!.auth.resetPasswordForEmail(
                    email,
                    { redirectTo: redirectUrl() },
                  );
                  if (error) throw error;
                  setStatus(
                    "If this email has an account, a reset link has been requested.",
                  );
                  return;
                }
                const result =
                  mode === "Register"
                    ? await cloud!.auth.signUp({
                        email,
                        password,
                        options: {
                          emailRedirectTo: redirectUrl(),
                          data: { display_name: name },
                        },
                      })
                    : await cloud!.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                setPassword("");
                setStatus(
                  mode === "Register"
                    ? "Check your email to verify your account before signing in."
                    : "Signed in. Open your account workspace below.",
                );
              });
            }}
          >
            {mode === "Register" && (
              <label>
                Display name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode !== "Reset password" && (
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === "Register" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy || !navigator.onLine}>
              {mode}
            </button>
          </form>
          <div className="button-row">
            {["Sign in", "Register", "Reset password"]
              .filter((m) => m !== mode)
              .map((m) => (
                <button
                  className="text-button"
                  key={m}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
          </div>
        </section>
      )}
      {user && (
        <>
          <section className="panel account-panel">
            <h2>
              {user.user_metadata.display_name ||
                user.user_metadata.full_name ||
                "Your account"}
            </h2>
            {typeof user.user_metadata.avatar_url === "string" &&
              /^https:\/\//.test(user.user_metadata.avatar_url) && (
                <img
                  referrerPolicy="no-referrer"
                  className="account-avatar"
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                />
              )}
            <p>{user.email}</p>
            <p>
              Joined {new Date(user.created_at).toLocaleDateString()} ·{" "}
              {user.email_confirmed_at
                ? "Email verified"
                : "Email verification pending"}
            </p>
            <p>
              {sessions} study sessions · {attempts} practice/exam attempts in
              this workspace.
            </p>
            {workspaceId !== user.id ? (
              <>
                <p>
                  Guest data stays separate. Open your account workspace, then
                  explicitly import guest material if desired.
                </p>
                <button
                  className="primary"
                  onClick={() => switchWorkspace(user.id)}
                >
                  Open account workspace
                </button>
              </>
            ) : (
              <>
                <h3>Synchronization</h3>
                <p>
                  Cloud sync shares your study library, question banks,
                  progress, planner, notes and preferences with your Supabase
                  account. AI tutor conversations stay separate. Enable only
                  when you want to upload this workspace.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={
                      localStorage.getItem(`recall-sync:${workspaceId}`) ===
                      "true"
                    }
                    onChange={(e) => {
                      localStorage.setItem(
                        `recall-sync:${workspaceId}`,
                        String(e.target.checked),
                      );
                      window.dispatchEvent(new Event("recall-sync-setting"));
                      setStatus(
                        e.target.checked
                          ? "Automatic synchronization enabled."
                          : "Automatic synchronization paused.",
                      );
                    }}
                  />
                  Synchronize this workspace automatically
                </label>
                <p>
                  {state?.pending
                    ? "Local changes are queued."
                    : state?.lastSync
                      ? `Last synchronized ${new Date(state.lastSync).toLocaleString()}`
                      : "Not synchronized yet."}
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => setStatus(await syncWorkspace()))
                  }
                >
                  Sync now
                </button>
                {state?.conflict && (
                  <section className="conflict-panel">
                    <h3>Both devices have changes</h3>
                    <p>
                      Automatic synchronization has paused. Export both versions
                      before choosing. Resolution keeps a recovery copy of both
                      versions on this device.
                    </p>
                    <div className="button-row">
                      <button
                        className="secondary"
                        onClick={() =>
                          void run(async () =>
                            download(
                              "local-library.json",
                              await exportBackup(),
                            ),
                          )
                        }
                      >
                        Export local version
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          download("cloud-library.json", state.conflict.payload)
                        }
                      >
                        Export cloud version
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Replace the cloud version with this device? A recovery copy will be retained.",
                            )
                          )
                            void run(async () =>
                              setStatus(await syncWorkspace("local")),
                            );
                        }}
                      >
                        Keep this device
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Replace this device with the cloud version? A recovery copy will be retained.",
                            )
                          )
                            void run(async () =>
                              setStatus(await syncWorkspace("remote")),
                            );
                        }}
                      >
                        Keep cloud version
                      </button>
                    </div>
                  </section>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Copy the guest library, progress, history, questions, notes and plans into this account? Guest data stays untouched; repeating imports creates new copies. Conflicting active drafts stay in the guest workspace.",
                      )
                    )
                      void run(importGuest);
                  }}
                >
                  Import guest material
                </button>
              </>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await cloud!.auth.updateUser({
                    data: { display_name: name },
                  });
                  if (error) throw error;
                }, "Profile updated");
              }}
            >
              <label>
                Update display name
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Update profile
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await cloud!.auth.updateUser({
                    email: newEmail,
                  });
                  if (error) throw error;
                  setNewEmail("");
                }, "Check your email to confirm the address change.");
              }}
            >
              <label>
                New email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Update email
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await cloud!.auth.updateUser({ password });
                  if (error) throw error;
                  setPassword("");
                  setMode("Sign in");
                }, "Password updated");
              }}
            >
              <label>
                {mode === "New password"
                  ? "Set new password"
                  : "Change password"}
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Save new password
              </button>
            </form>
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await cloud!.auth.signOut();
                    if (error) throw error;
                    switchWorkspace("guest");
                  })
                }
              >
                Sign out
              </button>
              <button
                className="danger-text"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently delete your cloud account and synchronized library? Export a backup first. Downloaded local copies on other devices are not remotely erased.",
                    )
                  )
                    void run(async () => {
                      const { error } =
                        await cloud!.functions.invoke("delete-account");
                      if (error) throw error;
                      await cloud!.auth.signOut({ scope: "local" });
                      if (workspaceId === user.id) await db.delete();
                      switchWorkspace("guest");
                    });
                }}
              >
                Delete account
              </button>
            </div>
          </section>
        </>
      )}
      {workspaceId !== "guest" && (
        <section className="panel">
          <p>
            Downloaded account data is available offline on this browser.
            Browser storage is not encrypted by this app; use a trusted device
            and browser profile.
          </p>
          <button
            className="secondary"
            onClick={() => switchWorkspace("guest")}
          >
            Return to guest workspace
          </button>
          {!user && (
            <button
              className="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    "Remove this downloaded account workspace from this browser? Export a backup first.",
                  )
                )
                  void run(async () => {
                    await db.delete();
                    switchWorkspace("guest");
                  });
              }}
            >
              Remove downloaded account data
            </button>
          )}
        </section>
      )}
      {recovery
        .filter((r) => r.id.startsWith("recovery:"))
        .map((r) => (
          <button
            className="secondary"
            key={r.id}
            onClick={() =>
              download(
                `sync-${r.id.replace(":", "-")}.json`,
                JSON.parse(r.value),
              )
            }
          >
            Export recovery copy ·{" "}
            {new Date(Number(r.id.split(":")[1])).toLocaleString()}
          </button>
        ))}
    </div>
  );
}
export function CloudStatus() {
  const [status, setStatus] = useState(
    workspaceId === "guest"
      ? "Guest · saved locally"
      : "Account · saved locally",
  );
  useEffect(() => {
    if (!cloud || workspaceId === "guest") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!active) return;
      if (localStorage.getItem(`recall-sync:${workspaceId}`) === "true") {
        if (!navigator.onLine) {
          await queueWorkspace();
          setStatus("Offline · changes queued");
        } else
          try {
            const result = await syncWorkspace();
            if (active) setStatus(result);
          } catch (e) {
            if (active) setStatus(`Sync paused · ${(e as Error).message}`);
          }
      } else setStatus("Account · sync paused");
      if (active) timer = setTimeout(tick, 10000);
    }
    const resume = () => {
      clearTimeout(timer);
      void tick();
    };
    void tick();
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("recall-sync-setting", resume);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("recall-sync-setting", resume);
    };
  }, []);
  return (
    <span className="cloud-status" aria-live="polite">
      {status}
    </span>
  );
}
