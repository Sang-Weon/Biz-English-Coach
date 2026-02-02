// Client-side API wrapper for Gemini functionality
// All actual API calls are made through the server-side Route Handler

export const generateTopics = async (categories?: string[]): Promise<string[]> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generateTopics', categories }),
  });
  if (!response.ok) throw new Error('Failed to generate topics');
  return response.json();
};

export const generateBriefing = async (topic: string): Promise<{ fullText: string; sentences: string[] }> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generateBriefing', topic }),
  });
  if (!response.ok) throw new Error('Failed to generate briefing');
  return response.json();
};

export const generateSpeech = async (text: string): Promise<string> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generateSpeech', text }),
  });
  if (!response.ok) throw new Error('Failed to generate speech');
  const data = await response.json();
  return data.audio;
};

export const getTranslation = async (text: string): Promise<{ translation: string; definition: string }> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getTranslation', text }),
  });
  if (!response.ok) throw new Error('Failed to get translation');
  return response.json();
};

export const analyzeShadowing = async (audioBase64: string, targetText: string): Promise<{
  transcription: string;
  score: number;
  feedback: string;
  betterPronunciationTips: string;
}> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyzeShadowing', audioBase64, targetText }),
  });
  if (!response.ok) throw new Error('Failed to analyze shadowing');
  return response.json();
};

export const generateDiscussionQuestion = async (topic: string, briefingText: string): Promise<string> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generateDiscussionQuestion', topic, briefingText }),
  });
  if (!response.ok) throw new Error('Failed to generate discussion question');
  const data = await response.json();
  return data.question;
};

export const analyzeDiscussionResponse = async (audioBase64: string, question: string): Promise<{
  correctedResponse: string;
  grammarNotes: string;
  vocabularySuggestions: string;
  betterAlternative: string;
}> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyzeDiscussionResponse', audioBase64, question }),
  });
  if (!response.ok) throw new Error('Failed to analyze discussion response');
  return response.json();
};
