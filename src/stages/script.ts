import { config } from '../config.js';
import { completeJson } from '../llm.js';
import type { Outline, Research, Script } from '../types.js';

const WORDS_PER_MINUTE = 150;

function system(): string {
  return `You are the head writer for "The AI Edge", a two-host podcast about AI for business and productivity.

The hosts:
- HOST_A is ${config.hostAName}: optimistic operator. Thinks in workflows and ROI, reaches for concrete examples, gets excited about what is now possible.
- HOST_B is ${config.hostBName}: constructive skeptic. Asks "does this survive contact with a real team?", pushes on cost, risk and hype, but is never cynical for its own sake.

Write a conversation, not two monologues:
- They interrupt, react in three words, finish each other's thoughts, and disagree at least twice before landing somewhere.
- No "Welcome back to the show" boilerplate beyond a short natural cold open.
- No bullet-point-sounding lines, no "firstly/secondly", no reading out URLs.
- Numbers and claims must match the outline. Invent nothing.
- Never reproduce source wording verbatim.
- Close on the takeaway, said like a person, not like a summary slide.

Also write the episode "title" (punchy, under 70 characters, no clickbait colon-soup) and a "description" of 2-3 sentences for the podcast feed.

Return: {"title": string, "description": string, "lines": [{"speaker": "HOST_A"|"HOST_B", "text": string}]}`;
}

export async function runScript(research: Research, outline: Outline, reviewNotes?: string): Promise<Script> {
  const targetWords = config.targetMinutes * WORDS_PER_MINUTE;
  const notes = reviewNotes ? `\n\nThe previous script was rejected by the human editor. Edit notes to address:\n${reviewNotes}` : '';

  const script = await completeJson<Script>(
    system(),
    `Theme: ${research.theme}
Thesis: ${outline.thesis}

Talking points:
${outline.talkingPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

Takeaway: ${outline.takeaway}

Target length: about ${config.targetMinutes} minutes of audio, roughly ${targetWords} words of dialogue.${notes}`,
    8000,
  );

  const lines = (script.lines ?? []).filter(
    (line) => (line.speaker === 'HOST_A' || line.speaker === 'HOST_B') && typeof line.text === 'string' && line.text.trim(),
  );
  if (lines.length === 0) {
    throw new Error('Script agent returned no usable dialogue');
  }

  const wordCount = lines.reduce((total, line) => total + line.text.trim().split(/\s+/).length, 0);
  return {
    title: script.title ?? research.theme,
    description: script.description ?? outline.thesis,
    lines,
    estimatedMinutes: Math.round((wordCount / WORDS_PER_MINUTE) * 10) / 10,
  };
}
