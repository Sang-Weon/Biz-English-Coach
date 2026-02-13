export enum AppState {
  ONBOARDING = 'ONBOARDING',
  TOPIC_SELECTION = 'TOPIC_SELECTION',
  BRIEFING_GENERATION = 'BRIEFING_GENERATION',
  LISTENING_PHASE = 'LISTENING_PHASE',
  SHADOWING_PHASE = 'SHADOWING_PHASE',
  DISCUSSION_PHASE = 'DISCUSSION_PHASE',
  DISCUSSION_FEEDBACK = 'DISCUSSION_FEEDBACK'
}

export interface BriefingContent {
  fullText: string;
  sentences: string[];
  topic: string;
}

export interface ShadowingFeedback {
  score: number;
  transcription: string;
  feedback: string;
  betterPronunciationTips: string;
}

export interface DiscussionFeedback {
  correctedResponse: string;
  grammarNotes: string;
  vocabularySuggestions: string;
  betterAlternative: string;
}

export interface UserPreferences {
  categories: string[];
  hasCompletedOnboarding: boolean;
}
