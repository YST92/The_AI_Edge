import { config } from './config.js';
import { newEpisodeId, saveEpisode } from './store.js';
import { runResearch } from './stages/research.js';
import { runSynthesis } from './stages/synthesis.js';
import { runScript } from './stages/script.js';
import { runVoice } from './stages/voice.js';
import { notify, runPublish } from './stages/publish.js';
import type { Episode } from './types.js';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stages 2-4: research, synthesis and scripting, ending at the human review checkpoint. */
export async function draftEpisode(): Promise<Episode> {
  const now = new Date().toISOString();
  let episode: Episode = await saveEpisode({
    id: newEpisodeId(),
    createdAt: now,
    updatedAt: now,
    status: 'drafting',
    revision: 1,
  });

  try {
    const research = await runResearch();
    episode = await saveEpisode({ ...episode, research });

    const outline = await runSynthesis(research);
    episode = await saveEpisode({ ...episode, outline });

    const script = await runScript(research, outline);
    episode = await saveEpisode({ ...episode, script, status: 'awaiting_review' });

    await notify(
      `*The AI Edge* — new script ready for review\n*${script.title}* (~${script.estimatedMinutes} min)\n${config.publicBaseUrl}/review/${episode.id}`,
    );
    return episode;
  } catch (error) {
    const failed = await saveEpisode({ ...episode, status: 'failed', error: message(error) });
    await notify(`*The AI Edge* — drafting failed for ${failed.id}: ${failed.error}`);
    throw error;
  }
}

/** Re-runs synthesis and scripting with the editor's notes, back to review. */
export async function reviseEpisode(episode: Episode, reviewNotes: string): Promise<Episode> {
  if (!episode.research) {
    throw new Error('Episode has no research to revise from');
  }
  const outline = await runSynthesis(episode.research, reviewNotes);
  const script = await runScript(episode.research, outline, reviewNotes);

  const revised = await saveEpisode({
    ...episode,
    outline,
    script,
    reviewNotes,
    revision: episode.revision + 1,
    status: 'awaiting_review',
  });

  await notify(
    `*The AI Edge* — revision ${revised.revision} ready for review\n*${script.title}*\n${config.publicBaseUrl}/review/${revised.id}`,
  );
  return revised;
}

/** Stage 5: render the approved script to audio. */
export async function renderEpisodeAudio(episode: Episode): Promise<Episode> {
  if (!episode.script) {
    throw new Error('Episode has no script');
  }
  if (episode.status !== 'approved' && episode.status !== 'audio_ready') {
    throw new Error(`Episode ${episode.id} is not approved (status: ${episode.status})`);
  }

  const { file, durationSeconds } = await runVoice(episode.id, episode.script);
  return saveEpisode({ ...episode, audioFile: file, audioDurationSeconds: durationSeconds, status: 'audio_ready' });
}

/** Stage 6: upload and publish. */
export async function publishEpisode(episode: Episode): Promise<Episode> {
  const publishUrl = await runPublish(episode);
  const published = await saveEpisode({ ...episode, publishUrl, status: 'published' });
  await notify(`*The AI Edge* — episode is live: ${published.script?.title}\n${publishUrl}`);
  return published;
}
