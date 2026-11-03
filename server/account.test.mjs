import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = (
  await readFile(
    new URL("../supabase/functions/delete-account/index.ts", import.meta.url),
    "utf8",
  )
).replace(/^import[^;]+;\s*/, "");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ valid = true, deletionError = null } = {}) {
  let handler, deleted;
  const values = {
    APP_ORIGINS: "https://recall.example.com",
    SUPABASE_URL: "https://project.example.com",
    SUPABASE_ANON_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
  };
  const Deno = {
    env: { get: (name) => values[name] },
    serve: (fn) => {
      handler = fn;
    },
  };
  const createClient = (_url, key, options) =>
    key === values.SUPABASE_SERVICE_ROLE_KEY
      ? {
          auth: {
            admin: {
              deleteUser: async (id) => {
                deleted = id;
                return { error: deletionError };
              },
            },
          },
        }
      : {
          auth: {
            getUser: async () => ({
              data: {
                user:
                  valid &&
                  options.global.headers.Authorization === "Bearer valid-token"
                    ? { id: "authenticated-user" }
                    : null,
              },
              error: valid ? null : new Error("Invalid session"),
            }),
          },
        };
  new Function("Deno", "createClient", code)(Deno, createClient);
  return {
    request: (method = "POST", headers = {}, body) =>
      handler(
        new Request("https://edge.example.com/delete-account", {
          method,
          headers: { Origin: "https://recall.example.com", ...headers },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      ),
    deleted: () => deleted,
  };
}
test("account deletion rejects untrusted origins, methods and missing/invalid sessions", async () => {
  const f = fixture();
  assert.equal(
    (await f.request("POST", { Origin: "https://attacker.example" })).status,
    403,
  );
  assert.equal((await f.request("GET")).status, 405);
  assert.equal((await f.request()).status, 401);
  assert.equal(
    (
      await fixture({ valid: false }).request("POST", {
        Authorization: "Bearer invalid",
      })
    ).status,
    401,
  );
  assert.equal(f.deleted(), undefined);
});
test("account deletion derives identity from the validated session, ignoring supplied user IDs", async () => {
  const f = fixture();
  const response = await f.request(
    "POST",
    { Authorization: "Bearer valid-token" },
    { userId: "another-account" },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.equal(f.deleted(), "authenticated-user");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://recall.example.com",
  );
});
test("deletion failures are sanitized and configured preflights work", async () => {
  const f = fixture({
    deletionError: new Error("private provider diagnostic"),
  });
  assert.equal((await f.request("OPTIONS")).status, 204);
  const response = await f.request("POST", {
    Authorization: "Bearer valid-token",
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Account deletion failed. Retry later.",
  });
});
