import { config, requireConfig } from './config.js';

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Calls Claude and returns the raw text of the first text block. */
export async function complete(system: string, user: string, maxTokens = 4000): Promise<string> {
  requireConfig(config.anthropicApiKey, 'ANTHROPIC_API_KEY');

  const response = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = data.content.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new Error('Anthropic API returned no text content');
  }
  return text;
}

/** Calls Claude and parses the response as JSON, tolerating markdown code fences. */
export async function completeJson<T>(system: string, user: string, maxTokens = 4000): Promise<T> {
  const raw = await complete(`${system}\n\nRespond with JSON only. No prose, no code fences.`, user, maxTokens);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (start === -1 || end === -1) {
    throw new Error(`Model did not return JSON: ${candidate.slice(0, 300)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
