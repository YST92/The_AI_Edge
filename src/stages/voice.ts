import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config, requireConfig } from '../config.js';
import { audioPath } from '../store.js';
import type { Script } from '../types.js';

const run = promisify(execFile);

async function synthesizeLine(text: string, voiceId: string, previousText: string, nextText: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': config.elevenLabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabsModel,
        previous_text: previousText || undefined,
        next_text: nextText || undefined,
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.3 },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function durationSeconds(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return Math.round(Number(stdout.trim()));
}

/** Renders the script to a single normalized MP3 and returns its file name plus duration. */
export async function runVoice(episodeId: string, script: Script): Promise<{ file: string; durationSeconds: number }> {
  requireConfig(config.elevenLabsApiKey, 'ELEVENLABS_API_KEY');
  requireConfig(config.voiceIdHostA, 'VOICE_ID_HOST_A');
  requireConfig(config.voiceIdHostB, 'VOICE_ID_HOST_B');

  const workDir = path.join(config.dataDir, 'tmp', episodeId);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  try {
    const clips: string[] = [];

    // Sequential on purpose: ElevenLabs continuity hints depend on neighbouring lines.
    for (const [index, line] of script.lines.entries()) {
      const voiceId = line.speaker === 'HOST_A' ? config.voiceIdHostA : config.voiceIdHostB;
      const audio = await synthesizeLine(
        line.text,
        voiceId,
        script.lines[index - 1]?.text ?? '',
        script.lines[index + 1]?.text ?? '',
      );
      const clip = path.join(workDir, `${String(index).padStart(4, '0')}.mp3`);
      await writeFile(clip, audio);
      clips.push(clip);
    }

    const parts = [
      ...(config.introMusicFile ? [config.introMusicFile] : []),
      ...clips,
      ...(config.outroMusicFile ? [config.outroMusicFile] : []),
    ];

    const listFile = path.join(workDir, 'concat.txt');
    await writeFile(listFile, parts.map((part) => `file '${part.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

    const fileName = `${episodeId}.mp3`;
    const output = audioPath(fileName);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '44100', '-b:a', '128k',
      output,
    ]);

    return { file: fileName, durationSeconds: await durationSeconds(output) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
