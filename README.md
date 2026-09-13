# The AI Edge — podcast pipeline

Turns AI/business news into a finished, publishable podcast episode. Built from the n8n blueprint: research → synthesis → script → **human review** → voice → publish.

The heavy lifting lives in this container (so it is testable, versioned and cheap to change). n8n stays a thin orchestrator: it wakes the pipeline up on a schedule and moves approved episodes forward.

```
Schedule (Mon/Thu 06:00)
   └─► POST /api/episodes          stages 2-4: research, outline, script
          └─► review desk          human approves or sends back with notes
                 └─► POST /api/episodes/:id/audio      stage 5: two-voice TTS + mix
                        └─► POST /api/episodes/:id/publish   stage 6: upload + go live
```

## The review desk

Open the service in a browser. You get a list of episodes, the sources they are built on, the outline, and the full script. Two buttons: **Approve**, or **Reject** with notes — rejecting re-runs the outline and script with your notes applied, and lands back in review.

Nothing becomes audio before you approve it.

## API

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/episodes` | Runs research → outline → script, stops at review |
| `GET` | `/api/episodes` | All episodes, newest first |
| `GET` | `/api/episodes/:id` | One episode |
| `POST` | `/api/episodes/:id/approve` | Marks the script approved |
| `POST` | `/api/episodes/:id/reject` | Body `{"notes": "..."}` — rewrites and returns to review |
| `POST` | `/api/episodes/:id/audio` | Renders the two-voice MP3 (approved episodes only) |
| `POST` | `/api/episodes/:id/publish` | Uploads to the podcast host and publishes |
| `GET` | `/api/episodes/:id/audio.mp3` | Streams the rendered audio |
| `GET` | `/healthz` | Health check |

All `/api` routes require `Authorization: Bearer $API_TOKEN` when `API_TOKEN` is set.

## Configuration

Every secret comes from an environment variable — see [.env.example](.env.example). Nothing is read from disk or hard-coded.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | The research, synthesis and script agents |
| `RSS_FEEDS` | Comma-separated source feeds |
| `ELEVENLABS_API_KEY`, `VOICE_ID_HOST_A`, `VOICE_ID_HOST_B` | The two host voices |
| `TRANSISTOR_API_KEY`, `TRANSISTOR_SHOW_ID` | Podcast host |
| `NOTIFY_WEBHOOK_URL` | Slack-compatible webhook for review + live notifications |
| `API_TOKEN` | Protects the API and the review desk |
| `PUBLIC_BASE_URL` | Used to build the review links in notifications |
| `HOST_A_NAME`, `HOST_B_NAME`, `TARGET_EPISODE_MINUTES` | Show format |
| `INTRO_MUSIC_FILE`, `OUTRO_MUSIC_FILE` | Optional MP3 paths inside the container |

Episodes and audio are written to `DATA_DIR` (`/data`), which should be a persistent volume.

## Running it

```bash
docker run -p 8080:8080 --env-file .env -v aiedge-data:/data ghcr.io/afasgroep/the_ai_edge:latest
```

Locally:

```bash
npm install
npm run build
npm start
```

The container is built and pushed to GHCR on every push to `main` by [.github/workflows/container.yml](.github/workflows/container.yml).

## n8n workflows

Import both files from [n8n/](n8n) into n8n:

- `01-draft-episode.json` — Monday and Thursday at 06:00, drafts an episode and pings you with the review link.
- `02-voice-and-publish.json` — hourly, picks up anything you approved, renders the audio and publishes it.

In each workflow set `baseUrl` and `slackWebhookUrl` in the **Config** node, and attach a *Header Auth* credential (`Authorization` → `Bearer <API_TOKEN>`) to the HTTP nodes.

## Editorial guardrails

The agents are instructed to summarize and synthesize facts in their own words and never reproduce source text verbatim — this matters legally, and it keeps the show from sounding like a read-aloud aggregator. The human checkpoint exists to catch the rest: factual accuracy, phrasing that sits too close to a source, and tone.
