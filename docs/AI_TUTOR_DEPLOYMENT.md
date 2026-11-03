# Deploy the AI tutor backend with Docker

These files prepare deployment. They do not provision a host, buy a domain, or activate a paid service. GitHub Pages serves only the frontend.

## Prerequisites and secrets

Use one Linux server with Docker Engine and Docker Compose v2, persistent storage, outbound HTTPS to the configured AI provider, and a hostname pointing to it. Open inbound TCP ports 80 and 443 for HTTPS. Do not expose backend port 8787 publicly.

On the server, check out the reviewed repository revision, then run:

    cp deploy/tutor.env.example .env
    chmod 600 .env

Populate .env privately, using the host's configuration or secret-management workflow:

- TUTOR_DOMAIN: your real backend hostname, without https:// or a path.
- TUTOR_API_KEY: the provider key, used exclusively by the backend.
- TUTOR_USERS_JSON: account names mapped to SHA-256 hashes of random personal access tokens. Follow the generation instructions in AI_TUTOR.md. Empty {} denies all chat access.
- TUTOR_ALLOWED_ORIGINS: exact browser origins, comma-separated. For the Pages frontend use https://al-hassan-sameh.github.io without /QuizletClone.
- TUTOR_MODEL and TUTOR_PROVIDER_URL: a supported model and OpenAI-compatible HTTPS completions endpoint.

Never put secrets in source control, Docker build arguments/images, VITE_ variables, screenshots, or chat. The Docker build context allowlists only the server source and Dockerfile. Personal access tokens must differ from provider keys.

## Validate and launch

From the repository root:

    docker compose -f compose.tutor.yml config --quiet
    docker compose -f compose.tutor.yml up -d --build
    docker compose -f compose.tutor.yml ps
    curl --fail https://YOUR_BACKEND_HOSTNAME/healthz

The health response is {"status":"ok"}. This checks liveness, not provider credentials, billing, or output quality.

Caddy obtains and renews HTTPS certificates and forwards streamed chunks immediately. Certificate issuance requires real DNS and publicly reachable ports 80/443; the example domain is a placeholder. The backend runs as an unprivileged user with a read-only root filesystem, resource limits, and a writable private history volume. This is a single-process deployment; distributed instances need shared limits and reference/history storage.

## Connect the app

After publishing the frontend, open https://al-hassan-sameh.github.io/QuizletClone/. Select Ask AI Tutor → Privacy & connection. Enter https://YOUR_BACKEND_HOSTNAME and your separate personal tutor access token, then Connect securely.

Request a hint, submit/reveal, and ask why a distractor is incorrect. Check follow-ups, card switching, saved chats and offline study. Live model behavior and billing require real server credentials; automated tests use provider doubles and incur no AI charges.

## Maintenance and rollback

The named tutor-history volume contains per-account cloud conversations. tutor-tls and tutor-proxy-config retain Caddy state. Secure and back up these volumes using your host's volume tools. Back up the private .env separately. Browser study data remains separate.

Update by checking out a reviewed revision and running docker compose -f compose.tutor.yml up -d --build. Pull updated base images periodically and revalidate. Environment changes require recreating the backend container.

Stop without deleting stored history:

    docker compose -f compose.tutor.yml down

Do not add --volumes unless you intend to delete cloud conversations and TLS state. To roll back, check out the previous reviewed revision and rebuild while retaining the named volumes.

## Automated checks

CI builds the image, checks health without provider credentials, validates Compose and Caddy configuration, and runs the application/server/browser tests. CI does not provision hosting, request public certificates, configure private secrets, or call a live AI provider.
