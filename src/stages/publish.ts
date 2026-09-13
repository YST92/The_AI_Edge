import { readFile } from 'node:fs/promises';
import { config, requireConfig } from '../config.js';
import { audioPath } from '../store.js';
import type { Episode } from '../types.js';

const API = 'https://api.transistor.fm/v1';

function headers(): Record<string, string> {
  return { 'x-api-key': config.transistorApiKey };
}

async function json<T>(response: Response, step: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`Transistor ${step} failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** Uploads the finished MP3 to Transistor and publishes the episode. Returns the public URL. */
export async function runPublish(episode: Episode): Promise<string> {
  requireConfig(config.transistorApiKey, 'TRANSISTOR_API_KEY');
  requireConfig(config.transistorShowId, 'TRANSISTOR_SHOW_ID');
  if (!episode.audioFile || !episode.script) {
    throw new Error('Episode has no rendered audio to publish');
  }

  const authorized = await json<{ data: { attributes: { upload_url: string; audio_url: string } } }>(
    await fetch(`${API}/episodes/authorize_upload?filename=${encodeURIComponent(episode.audioFile)}`, {
      headers: headers(),
    }),
    'authorize_upload',
  );

  const upload = await fetch(authorized.data.attributes.upload_url, {
    method: 'PUT',
    headers: { 'content-type': 'audio/mpeg' },
    body: await readFile(audioPath(episode.audioFile)),
  });
  if (!upload.ok) {
    throw new Error(`Audio upload failed (${upload.status}): ${await upload.text()}`);
  }

  const created = await json<{ data: { id: string } }>(
    await fetch(`${API}/episodes`, {
      method: 'POST',
      headers: { ...headers(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'episode[show_id]': config.transistorShowId,
        'episode[title]': episode.script.title,
        'episode[summary]': episode.script.description,
        'episode[audio_url]': authorized.data.attributes.audio_url,
      }),
    }),
    'create episode',
  );

  const published = await json<{ data: { attributes: { share_url?: string; media_url?: string } } }>(
    await fetch(`${API}/episodes/${created.data.id}/publish`, {
      method: 'PATCH',
      headers: { ...headers(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'episode[status]': 'published' }),
    }),
    'publish episode',
  );

  return published.data.attributes.share_url ?? published.data.attributes.media_url ?? `https://dashboard.transistor.fm/episodes/${created.data.id}`;
}

export async function notify(text: string): Promise<void> {
  if (!config.notifyWebhookUrl) return;
  try {
    await fetch(config.notifyWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.warn('[notify] failed:', error);
  }
}
