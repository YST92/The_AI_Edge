function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? '/data',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',

  rssFeeds: list(process.env.RSS_FEEDS),
  maxItemsPerFeed: Number(process.env.MAX_ITEMS_PER_FEED ?? 15),
  researchWindowHours: Number(process.env.RESEARCH_WINDOW_HOURS ?? 96),

  targetMinutes: Number(process.env.TARGET_EPISODE_MINUTES ?? 12),
  hostAName: process.env.HOST_A_NAME ?? 'Maya',
  hostBName: process.env.HOST_B_NAME ?? 'Daan',

  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenLabsModel: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2',
  voiceIdHostA: process.env.VOICE_ID_HOST_A ?? '',
  voiceIdHostB: process.env.VOICE_ID_HOST_B ?? '',

  introMusicFile: process.env.INTRO_MUSIC_FILE ?? '',
  outroMusicFile: process.env.OUTRO_MUSIC_FILE ?? '',

  transistorApiKey: process.env.TRANSISTOR_API_KEY ?? '',
  transistorShowId: process.env.TRANSISTOR_SHOW_ID ?? '',

  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? '',
  apiToken: process.env.API_TOKEN ?? '',
};

export function requireConfig(value: string, name: string): string {
  if (!value) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}
