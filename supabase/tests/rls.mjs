import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const pg = new PGlite();
await pg.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated;`,
);
await pg.exec(
  await readFile(
    new URL("../migrations/202611030001_learning.sql", import.meta.url),
    "utf8",
  ),
);
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
await pg.query("insert into auth.users values ($1),($2)", [a, b]);
await pg.exec("set role authenticated");
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
const payload = {
  version: 2,
  sets: [],
  sessions: [],
  reviews: [],
  platform: {
    banks: [],
    attempts: [],
    drafts: [],
    tasks: [],
    notes: [],
    bookmarks: [],
    preferences: [],
  },
};
const save = async (rev, content = payload) =>
  (
    await pg.query(
      "select public.save_learning_snapshot($1,$2::jsonb) as revision",
      [rev, JSON.stringify(content)],
    )
  ).rows[0].revision;
assert.equal(await save(0), 1);
assert.equal(await save(0), null);
assert.equal(await save(1), 2);
assert.equal(await save(1), null);
assert.equal(
  (await pg.query("select * from public.learning_snapshots")).rows[0].user_id,
  a,
);
await assert.rejects(
  () =>
    pg.query(
      "insert into public.learning_snapshots(user_id,payload) values($1,$2)",
      [b, JSON.stringify(payload)],
    ),
  /permission denied/,
);
await assert.rejects(() => save(2, {}), /Invalid or oversized/);
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
assert.equal(
  (await pg.query("select * from public.learning_snapshots")).rows.length,
  0,
);
assert.equal(await save(0), 1);
assert.equal(
  (await pg.query("select * from public.learning_snapshots")).rows[0].user_id,
  b,
);
await pg.exec("reset role; set role anon");
await assert.rejects(
  () => pg.query("select * from public.learning_snapshots"),
  /permission denied/,
);
await assert.rejects(() => save(0), /permission denied/);
await pg.close();
console.log(
  "PASS: actual SQL migration; own-row reads; cross-user isolation; anonymous denial; direct-write denial; invalid snapshot rejection; atomic revision compare-and-swap. Local PGlite only; hosted Supabase untested.",
);
