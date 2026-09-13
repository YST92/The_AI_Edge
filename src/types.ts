export type EpisodeStatus =
  | 'drafting'
  | 'awaiting_review'
  | 'rejected'
  | 'approved'
  | 'audio_ready'
  | 'published'
  | 'failed';

export interface SourceItem {
  url: string;
  title: string;
  summary: string;
  relevance: string;
}

export interface Research {
  theme: string;
  sources: SourceItem[];
}

export interface Outline {
  thesis: string;
  talkingPoints: string[];
  takeaway: string;
}

export interface ScriptLine {
  speaker: 'HOST_A' | 'HOST_B';
  text: string;
}

export interface Script {
  title: string;
  description: string;
  lines: ScriptLine[];
  estimatedMinutes: number;
}

export interface Episode {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: EpisodeStatus;
  research?: Research;
  outline?: Outline;
  script?: Script;
  reviewNotes?: string;
  revision: number;
  audioFile?: string;
  audioDurationSeconds?: number;
  publishUrl?: string;
  error?: string;
}
