import { GoogleGenAI, Type, Modality } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// -- Constants --
// Using 'gemini-3-flash-preview' for logic/text as it's fast and capable.
// Using 'gemini-3-pro-preview' for high-quality content generation.
// Using 'gemini-2.5-flash-preview-tts' for TTS.
const TEXT_MODEL = 'gemini-3-flash-preview';
const CONTENT_MODEL = 'gemini-3-pro-preview'; 
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const AUDIO_ANALYSIS_MODEL = 'gemini-3-flash-preview'; // Good for multimodal

export const generateTopics = async (): Promise<string[]> => {
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: "Identify 5 currently trending hot topics related to US business, the stock market, AI technology, or the global economy. Return only a JSON array of strings, e.g., [\"Nvidia's AI Rally\", \"Fed Interest Rates\", ...]",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  
  if (response.text) {
    return JSON.parse(response.text);
  }
  return ["AI Technology", "Stock Market", "Global Economy", "Tech Startups", "Remote Work Culture"];
};

export const generateBriefing = async (topic: string): Promise<{ fullText: string; sentences: string[] }> => {
  const prompt = `
    Create a professional business news briefing about "${topic}".
    The style should be like a Wall Street Journal or Bloomberg snippet.
    Length: Approximately 30-40 seconds when read aloud.
    Language: US Business English.
    
    Output Format: JSON with two fields:
    1. "fullText": The complete paragraph.
    2. "sentences": An array of strings, breaking the text into logical chunks for shadowing practice (1-2 sentences per chunk).
  `;

  const response = await ai.models.generateContent({
    model: CONTENT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullText: { type: Type.STRING },
          sentences: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["fullText", "sentences"]
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text);
  }
  throw new Error("Failed to generate briefing");
};

export const generateSpeech = async (text: string): Promise<string> => {
  // Returns Base64 Audio
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is a good, deep voice.
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  return base64Audio;
};

export const analyzeShadowing = async (audioBase64: string, targetText: string): Promise<any> => {
  const prompt = `
    The user is trying to read this sentence: "${targetText}".
    Listen to the audio. 
    1. Transcribe what you heard.
    2. Rate the pronunciation and intonation from 1 to 10.
    3. Give specific feedback on accent, intonation, or mispronounced words.
    4. Provide a tip for better American pronunciation.
    
    Return JSON. Keep the feedback language in English.
  `;

  const response = await ai.models.generateContent({
    model: AUDIO_ANALYSIS_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: audioBase64 } }, // Assuming recorder produces wav or webm/pcm mapped to wav
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcription: { type: Type.STRING },
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          betterPronunciationTips: { type: Type.STRING }
        }
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text);
  }
  throw new Error("Failed to analyze audio");
};

export const generateDiscussionQuestion = async (topic: string, briefingText: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `Based on this briefing about "${topic}": "${briefingText}", ask the user a short, simple opinion question suitable for an intermediate English learner (CEFR B1 level).
    
    Constraints:
    1. The question must be 1 short sentence (maximum 15 words).
    2. Use simple, clear vocabulary.
    3. It should be easy to answer immediately (e.g., "Do you think X is good?", "Would you use X?", "How does X affect you?").
    4. Do NOT ask complex hypothetical or multi-part questions.
    5. Return ONLY the question text.`
  });
  return response.text || "What do you think about this?";
};

export const analyzeDiscussionResponse = async (audioBase64: string, question: string): Promise<any> => {
   const prompt = `
    I asked the user: "${question}".
    Listen to their response.
    1. Transcribe the answer.
    2. Correct any grammar or vocabulary mistakes.
    3. Suggest a more professional "native speaker" way to phrase their idea.
    4. Provide vocabulary suggestions to elevate the answer.
    
    Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: AUDIO_ANALYSIS_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: audioBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          correctedResponse: { type: Type.STRING },
          grammarNotes: { type: Type.STRING },
          vocabularySuggestions: { type: Type.STRING },
          betterAlternative: { type: Type.STRING }
        }
      }
    }
  });
  
  if (response.text) {
    return JSON.parse(response.text);
  }
  throw new Error("Failed to analyze discussion");
}