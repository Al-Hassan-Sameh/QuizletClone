# Context-aware AI study tutor

## Run the real integration

Requires Node.js 22.12+. Study remains usable without configuring AI.

1. Run npm ci. Copy .env.example to .env on the backend host.
2. Set TUTOR_API_KEY to your provider's private API key. Set TUTOR_MODEL to a model enabled for your provider. The default adapter implements OpenAI-compatible streaming chat completions; TUTOR_PROVIDER_URL is server-controlled and must use HTTPS. To use a provider with a different protocol, supply a different async-generator adapter to createTutorServer.
3. Generate a separate personal access token for each tutor account:

   node --input-type=module -e "import {randomBytes,createHash} from 'node:crypto';const token=randomBytes(32).toString('base64url');console.log('Personal token:',token);console.log('Server hash:',createHash('sha256').update(token).digest('hex'));"

   Put only the hash in TUTOR_USERS_JSON, for example {"student":"<64-character-sha256-hash>"}. Keep this configuration private. Give the corresponding personal token to that student securely. Never use the AI provider key as a student's token. Removing the configured hash revokes access after restarting the service.

4. Run npm run tutor:server and npm run dev in separate terminals. Vite proxies /api/tutor to localhost:8787.
5. Open Flashcards or a Learn question, select Ask AI Tutor → Privacy & connection, leave the URL blank for the development proxy, enter the personal token, and connect.
6. On GitHub Pages, enter your deployed HTTPS tutor-service URL instead. Set TUTOR_ALLOWED_ORIGINS to the exact app origin (https://al-hassan-sameh.github.io), without the repository path. Keep CORS restrictive. GitHub Pages cannot execute this backend.
7. Deploy the Node service behind an HTTPS reverse proxy. Disable proxy response buffering for streaming. Set TUTOR_HOST=0.0.0.0 only when needed inside a container/private network. Mount TUTOR_DATA_DIR on a durable private volume. Configure volume encryption and backups according to your deployment requirements.

No provider credentials are bundled into the PWA. Personal access tokens stay in frontend memory and must be re-entered after a reload. They are sent only to the explicitly configured tutor service. Study cards, schedules, and sessions remain local.

## Behavior and privacy

Flashcards, active Learn questions (MCQ, written and true/false), and submitted test reviews use the same tutor. During tests the tutor is disabled; this also protects any future timed-test UI using that mode. The current app has no timer, so restricted timed-test modes are not introduced.

Every request shares only the active card snapshot and up to 19 recent messages. Up to three related cards are retrieved locally by term overlap only after explicit opt-in and answer reveal. There is no whole-library upload. Folder and tags supply subject/topic metadata. The current card schema has no separate hint/explanation field; the tutor must not pretend those fields exist. Notes are sent only when explicitly enabled and the answer is revealed.

Before reveal, the frontend and backend both remove definition, answer, private notes, related answers and selected-answer fields. The prompt restricts the tutor to hints. AI can infer an answer from a question and options, so this is guidance plus data minimization, not a proof that a model cannot spoil a question. Tests therefore disable tutor access entirely. Reveal in Learn counts as an incorrect attempt and permits the ordinary difficult-card retry.

Conversations are separate by service/account, set, card, question prompt/option order, and hint/revealed state. Switching or closing cancels in-flight requests. Old responses cannot update a new keyed chat instance. Reveal conversations are hidden when returning to an unanswered view.

Local history is on by default and stores the latest 40 messages per thread. Guest users can read saved local conversations offline; cloud AI still requires a configured personal account. The Save this conversation checkbox deletes that local thread and stops saving it; it does not erase other threads. Clear conversation deletes the current local and cloud thread. Cloud saving is off by default and opt-in per open thread; loading a cloud thread is explicit. Account credentials do not persist. History is not included in existing study-library backups.

## Authorization boundary

Recall has no existing account system or server-owned card database. The tutor service introduces personal service accounts via hashed access tokens; it does not claim to authenticate an existing Recall account. An authenticated user uploads only their currently selected local card snapshot to their own namespace. The server issues a content-bound reference and checks its owner on every chat. Card-reference ownership and history reads/deletes are isolated by authenticated account. The service cannot independently prove the provenance of browser-owned cards or certify that a local learner actually submitted an exam. Server-enforced high-stakes examinations would require authoritative server-owned questions and submissions.

Registered card snapshots are transient and capped at 1,000 entries per process. Persisted histories use private per-account directories and hashed filenames, written atomically with owner-only file permissions. Content is not logged. Multi-process deployments need a shared card-reference store, shared distributed limits, and transactional history storage; the included service is intentionally a single-process implementation.

Limits: 10 chat requests per minute, 100 per rolling day per account, at most two simultaneous streams, 64 KiB request body, 24,000 characters each of study context and recent conversation, 1,200 output tokens, and a 60-second response deadline. Provider errors are sanitized; retry uses the same conversation without duplicating the failed request. Provider billing and data-retention policies apply to shared content.

Imported content is explicitly untrusted data. Only the server defines system instructions, provider URL, model, and credentials. The tutor is instructed to cite the card ID, distinguish source facts from additional knowledge, acknowledge uncertainty, and flag potential source mistakes.

## Validation

Run:

- npm test
- npm run test:tutor:server
- npm run build
- npm run build:pages
- npm run test:e2e (install Chromium first if required)

Tests cover field stripping, MCQ order, mistake context, variant isolation, streaming split UTF-8, incomplete/failing streams, authentication, cross-user references/history, deletion, optional persistence, follow-up messages, rate limits, active-card changes, delayed responses, local persistence, offline study, and test restrictions. HTTP/browser tests use a deterministic provider double; production uses the actual provider adapter.

A real provider smoke test still requires deployment credentials. Verify hint behavior before reveal, explanations of each distractor after submission, follow-ups, source mistakes, and provider timeouts with the configured model. No live provider responses were tested during preparation.
