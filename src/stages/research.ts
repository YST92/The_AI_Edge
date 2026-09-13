import Parser from 'rss-parser';
import { config } from '../config.js';
import { completeJson } from '../llm.js';
import type { Research } from '../types.js';

const parser = new Parser({ timeout: 20000 });

interface RawItem {
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  source: string;
}

function clean(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

async function readFeed(url: string): Promise<RawItem[]> {
  const feed = await parser.parseURL(url);
  const cutoff = Date.now() - config.researchWindowHours * 3600_000;
  return (feed.items ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? '',
      url: item.link?.trim() ?? '',
      publishedAt: item.isoDate ?? item.pubDate ?? '',
      snippet: clean(item.contentSnippet ?? item.content ?? item.summary),
      source: feed.title ?? url,
    }))
    .filter((item) => item.title && item.url)
    .filter((item) => !item.publishedAt || new Date(item.publishedAt).getTime() >= cutoff)
    .slice(0, config.maxItemsPerFeed);
}

async function gather(): Promise<RawItem[]> {
  if (config.rssFeeds.length === 0) {
    throw new Error('No RSS_FEEDS configured');
  }
  const results = await Promise.allSettled(config.rssFeeds.map(readFeed));
  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[research] feed failed:', result.reason);
      continue;
    }
    for (const item of result.value) {
      const key = item.url.split('?')[0].toLowerCase();
      const titleKey = item.title.toLowerCase();
      if (seen.has(key) || seen.has(titleKey)) continue;
      seen.add(key);
      seen.add(titleKey);
      items.push(item);
    }
  }

  if (items.length === 0) {
    throw new Error('No recent items found across the configured feeds');
  }
  return items;
}

const SYSTEM = `You are the research producer for "The AI Edge", a podcast about AI for business and productivity.

Your job: from a list of recent articles, pick the single most interesting theme for one episode and select the 4-6 items that support it. Depth over breadth — never try to cover everything.

Hard rules:
- Summarize and synthesize facts in your own words. NEVER reproduce article text verbatim, not even one sentence.
- Only pick items genuinely relevant to how AI changes business operations, productivity, or the way people work. Skip funding-round gossip, model benchmark drama, and consumer gadget news.
- "relevance" must explain why a business listener should care, concretely.

Return this shape:
{"theme": string, "sources": [{"url": string, "title": string, "summary": string, "relevance": string}]}`;

export async function runResearch(): Promise<Research> {
  const items = await gather();
  const catalogue = items
    .map((item, index) => `[${index + 1}] ${item.title}\nSource: ${item.source}\nURL: ${item.url}\nDate: ${item.publishedAt}\nSnippet: ${item.snippet}`)
    .join('\n\n');

  const research = await completeJson<Research>(
    SYSTEM,
    `Today is ${new Date().toISOString().slice(0, 10)}. Here are ${items.length} recent items:\n\n${catalogue}`,
  );

  if (!research.theme || !Array.isArray(research.sources) || research.sources.length === 0) {
    throw new Error('Research agent returned an unusable result');
  }
  return research;
}
