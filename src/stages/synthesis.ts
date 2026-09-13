import { completeJson } from '../llm.js';
import type { Outline, Research } from '../types.js';

const SYSTEM = `You are the editorial lead for "The AI Edge", a podcast about AI for business and productivity.

Turn raw research into the episode's angle and structure — the outline only, not the dialogue.

Produce:
- "thesis": ONE sentence stating the specific question or claim this episode addresses. Not a topic label; an actual argument.
- "talkingPoints": 4-6 points in the order they should be discussed. Each is a full sentence describing what gets said and which source backs it.
- "takeaway": one concrete, practical thing a listener can do or decide differently on Monday morning.

Facts in your own words only — never lift phrasing from the sources.

Return: {"thesis": string, "talkingPoints": string[], "takeaway": string}`;

export async function runSynthesis(research: Research, reviewNotes?: string): Promise<Outline> {
  const sources = research.sources
    .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\nSummary: ${source.summary}\nWhy it matters: ${source.relevance}`)
    .join('\n\n');

  const notes = reviewNotes ? `\n\nThe previous attempt was rejected by the human editor. Edit notes to address:\n${reviewNotes}` : '';

  const outline = await completeJson<Outline>(
    SYSTEM,
    `Theme: ${research.theme}\n\nSources:\n\n${sources}${notes}`,
  );

  if (!outline.thesis || !Array.isArray(outline.talkingPoints) || outline.talkingPoints.length === 0) {
    throw new Error('Synthesis agent returned an unusable outline');
  }
  return outline;
}
