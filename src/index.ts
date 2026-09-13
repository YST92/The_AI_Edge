import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { audioPath, getEpisode, initStore, listEpisodes, saveEpisode } from './store.js';
import { draftEpisode, publishEpisode, renderEpisodeAudio, reviseEpisode } from './pipeline.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function tokenMatches(provided: string): boolean {
  const expected = Buffer.from(config.apiToken);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiToken) {
    next();
    return;
  }
  const header = req.header('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : (req.header('x-api-token') ?? '');
  if (!provided || !tokenMatches(provided)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

async function loadEpisode(req: Request, res: Response) {
  const episode = await getEpisode(String(req.params.id));
  if (!episode) {
    res.status(404).json({ error: 'Episode not found' });
    return undefined;
  }
  return episode;
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

const api = express.Router();
api.use(authenticate);

api.post('/episodes', asyncRoute(async (_req, res) => {
  res.json(await draftEpisode());
}));

api.get('/episodes', asyncRoute(async (_req, res) => {
  res.json(await listEpisodes());
}));

api.get('/episodes/:id', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (episode) res.json(episode);
}));

api.post('/episodes/:id/approve', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (!episode) return;
  if (episode.status !== 'awaiting_review') {
    res.status(409).json({ error: `Episode is ${episode.status}, not awaiting review` });
    return;
  }
  res.json(await saveEpisode({ ...episode, status: 'approved' }));
}));

api.post('/episodes/:id/reject', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (!episode) return;
  const notes = String(req.body?.notes ?? '').trim();
  if (!notes) {
    res.status(400).json({ error: 'Edit notes are required when rejecting' });
    return;
  }
  res.json(await reviseEpisode(episode, notes));
}));

api.post('/episodes/:id/audio', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (episode) res.json(await renderEpisodeAudio(episode));
}));

api.post('/episodes/:id/publish', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (episode) res.json(await publishEpisode(episode));
}));

api.get('/episodes/:id/audio.mp3', asyncRoute(async (req, res) => {
  const episode = await loadEpisode(req, res);
  if (!episode) return;
  if (!episode.audioFile) {
    res.status(404).json({ error: 'No audio rendered yet' });
    return;
  }
  const file = audioPath(episode.audioFile);
  const info = await stat(file);
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('content-length', info.size);
  createReadStream(file).pipe(res);
}));

app.use('/api', api);

app.use(express.static(publicDir));
app.get('/review/:id', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', error);
  res.status(500).json({ error: error.message });
});

await initStore();
app.listen(config.port, () => {
  console.log(`The AI Edge pipeline listening on port ${config.port}`);
});
