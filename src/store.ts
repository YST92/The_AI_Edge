import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { Episode } from './types.js';

const episodesDir = path.join(config.dataDir, 'episodes');
const audioDir = path.join(config.dataDir, 'audio');

export async function initStore(): Promise<void> {
  await mkdir(episodesDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });
}

export function audioPath(fileName: string): string {
  return path.join(audioDir, path.basename(fileName));
}

export function newEpisodeId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 13);
  return `ep-${stamp}`;
}

export async function saveEpisode(episode: Episode): Promise<Episode> {
  const updated: Episode = { ...episode, updatedAt: new Date().toISOString() };
  await writeFile(path.join(episodesDir, `${updated.id}.json`), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

export async function getEpisode(id: string): Promise<Episode | undefined> {
  // Guard against path traversal via the :id route parameter.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
  try {
    const raw = await readFile(path.join(episodesDir, `${id}.json`), 'utf8');
    return JSON.parse(raw) as Episode;
  } catch {
    return undefined;
  }
}

export async function listEpisodes(): Promise<Episode[]> {
  const files = await readdir(episodesDir);
  const episodes = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => JSON.parse(await readFile(path.join(episodesDir, file), 'utf8')) as Episode),
  );
  return episodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
