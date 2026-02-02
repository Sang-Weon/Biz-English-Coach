import { GoogleGenAI, Type, Modality } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error("[v0] GEMINI_API_KEY is not set");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const TEXT_MODEL = 'gemini-2.5-flash-preview-04-17';
const CONTENT_MODEL = 'gemini-2.5-flash-preview-04-17';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const AUDIO_ANALYSIS_MODEL = 'gemini-2.5-flash-preview-04-17';

export async function POST(request: NextRequest) {
  if (!ai) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'generateTopics':
        return await handleGenerateTopics(params.categories);
      case 'generateBriefing':
        return await handleGenerateBriefing(params.topic);
      case 'generateSpeech':
        return await handleGenerateSpeech(params.text);
      case 'getTranslation':
        return await handleGetTranslation(params.text);
      case 'analyzeShadowing':
        return await handleAnalyzeShadowing(params.audioBase64, params.targetText);
      case 'generateDiscussionQuestion':
        return await handleGenerateDiscussionQuestion(params.topic, params.briefingText);
      case 'analyzeDiscussionResponse':
        return await handleAnalyzeDiscussionResponse(params.audioBase64, params.question);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[v0] Gemini API error:", error);
    return NextResponse.json({ error: "API request failed" }, { status: 500 });
  }
}

async function handleGenerateTopics(categories?: string[]) {
  const categoryFilter = categories && categories.length > 0
    ? `Focus on these categories: ${categories.join(', ')}. `
    : '';

  const response = await ai!.models.generateContent({
    model: TEXT_MODEL,
    contents: `${categoryFilter}Identify 5 currently trending hot topics related to US business, the stock market, AI technology, or the global economy. Return only a JSON array of strings, e.g., ["Nvidia's AI Rally", "Fed Interest Rates", ...]`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  if (response.text) {
    return NextResponse.json(JSON.parse(response.text));
  }
  return NextResponse.json(["AI Technology", "Stock Market", "Global Economy", "Tech Startups", "Remote Work Culture"]);
}

async function handleGenerateBriefing(topic: string) {
  const prompt = `
    Create a professional business news briefing about "${topic}".
    The style should be like a Wall Street Journal or Bloomberg snippet.
    Length: Approximately 30-40 seconds when read aloud.
    Language: US Business English.
    
    Output Format: JSON with two fields:
    1. "fullText": The complete paragraph.
    2. "sentences": An array of strings, breaking the text into logical chunks for shadowing practice (1-2 sentences per chunk).
  `;

  const response = await ai!.models.generateContent({
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
    return NextResponse.json(JSON.parse(response.text));
  }
  throw new Error("Failed to generate briefing");
}

async function handleGenerateSpeech(text: string) {
  const response = await ai!.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  return NextResponse.json({ audio: base64Audio });
}

async function handleGetTranslation(text: string) {
  const prompt = `
    Acts as a professional business English dictionary.
    Provide a Korean translation and a brief English definition for this term found in a business news context: "${text}".
    Keep it concise.
    Return JSON format: {"translation": "한국어 뜻", "definition": "Brief English business definition"}.
  `;

  const response = await ai!.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translation: { type: Type.STRING },
          definition: { type: Type.STRING }
        },
        required: ["translation", "definition"]
      }
    }
  });

  if (response.text) {
    return NextResponse.json(JSON.parse(response.text));
  }
  throw new Error("Translation failed");
}

async function handleAnalyzeShadowing(audioBase64: string, targetText: string) {
  const prompt = `
    The user is trying to read this sentence: "${targetText}".
    Listen to the audio. 
    1. Transcribe what you heard.
    2. Rate the pronunciation and intonation from 1 to 10.
    3. Give specific feedback on accent, intonation, or mispronounced words.
    4. Provide a tip for better American pronunciation.
    
    Return JSON. Keep the feedback language in English.
  `;

  const response = await ai!.models.generateContent({
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
          transcription: { type: Type.STRING },
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          betterPronunciationTips: { type: Type.STRING }
        }
      }
    }
  });

  if (response.text) {
    return NextResponse.json(JSON.parse(response.text));
  }
  throw new Error("Failed to analyze audio");
}

async function handleGenerateDiscussionQuestion(topic: string, briefingText: string) {
  const response = await ai!.models.generateContent({
    model: TEXT_MODEL,
    contents: `Based on this briefing about "${topic}": "${briefingText}", ask the user a short, simple opinion question suitable for an intermediate English learner (CEFR B1 level).
    
    Constraints:
    1. The question must be 1 short sentence (maximum 15 words).
    2. Use simple, clear vocabulary.
    3. It should be easy to answer immediately (e.g., "Do you think X is good?", "Would you use X?", "How does X affect you?").
    4. Do NOT ask complex hypothetical or multi-part questions.
    5. Return ONLY the question text.`
  });
  return NextResponse.json({ question: response.text || "What do you think about this?" });
}

async function handleAnalyzeDiscussionResponse(audioBase64: string, question: string) {
  const prompt = `
    I asked the user: "${question}".
    Listen to their response.
    1. Transcribe the answer.
    2. Correct any grammar or vocabulary mistakes.
    3. Suggest a more professional "native speaker" way to phrase their idea.
    4. Provide vocabulary suggestions to elevate the answer.
    
    Return JSON.
  `;

  const response = await ai!.models.generateContent({
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
    return NextResponse.json(JSON.parse(response.text));
  }
  throw new Error("Failed to analyze discussion");
}
