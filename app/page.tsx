"use client";

import { useState, useEffect, useRef } from 'react';
import { AppState, BriefingContent, ShadowingFeedback, DiscussionFeedback, UserPreferences } from '@/lib/types';
import * as Gemini from '@/lib/gemini-client';
import { decodeAudioData, blobToBase64 } from '@/lib/audio-utils';
import { Button } from '@/components/ui/button';
import { Recorder } from '@/components/recorder';

const STORAGE_KEY = 'nativebiz_preferences';

const AVAILABLE_CATEGORIES = [
  { id: 'ai-tech', label: 'AI & Technology', icon: '🤖' },
  { id: 'stock-market', label: 'Stock Market', icon: '📈' },
  { id: 'global-economy', label: 'Global Economy', icon: '🌍' },
  { id: 'startups', label: 'Startups & Innovation', icon: '🚀' },
  { id: 'finance', label: 'Finance & Banking', icon: '💰' },
  { id: 'crypto', label: 'Cryptocurrency', icon: '₿' },
];

const loadPreferences = (): UserPreferences => {
  if (typeof window === 'undefined') return { categories: [], hasCompletedOnboarding: false };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load preferences', e);
  }
  return { categories: [], hasCompletedOnboarding: false };
};

const savePreferences = (prefs: UserPreferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save preferences', e);
  }
};

export default function HomePage() {
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({ categories: [], hasCompletedOnboarding: false });
  const [currentState, setCurrentState] = useState<AppState>(AppState.ONBOARDING);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [briefing, setBriefing] = useState<BriefingContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [shadowingFeedback, setShadowingFeedback] = useState<ShadowingFeedback | null>(null);
  const [discussionQuestion, setDiscussionQuestion] = useState<string>('');
  const [discussionFeedback, setDiscussionFeedback] = useState<DiscussionFeedback | null>(null);
  const [userRecordingUrl, setUserRecordingUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [briefingAudio, setBriefingAudio] = useState<string | null>(null);
  const [discussionAudio, setDiscussionAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    translation?: string;
    definition?: string;
    loading: boolean;
  } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isUserRecordingRef = useRef<boolean>(false);

  // Load preferences on mount
  useEffect(() => {
    const prefs = loadPreferences();
    setUserPreferences(prefs);
    setCurrentState(prefs.hasCompletedOnboarding ? AppState.TOPIC_SELECTION : AppState.ONBOARDING);
  }, []);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playAudio = async (base64: string | null, speed: number = 1.0, onEnded?: () => void) => {
    if (!base64) return; // Skip if no audio (demo mode)
    initAudio();
    if (!audioContextRef.current) return;

    stopAudio();

    if (isUserRecordingRef.current) return;

    setIsPlaying(true);
    try {
      const buffer = await decodeAudioData(base64, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        setIsPlaying(false);
        if (onEnded) onEnded();
      };
      currentSourceRef.current = source;
      source.start(0);
    } catch (e) {
      console.error("Audio playback error", e);
      setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleRecordingStart = () => {
    isUserRecordingRef.current = true;
    stopAudio();
  };

  const handleRecordingEnd = () => {
    isUserRecordingRef.current = false;
  };

  const handleTextSelection = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (!text || text.length < 2) {
      setTooltip(null);
      return;
    }

    const range = selection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();

    if (rect) {
      const tooltipX = rect.left + window.scrollX + rect.width / 2;
      const tooltipY = rect.top + window.scrollY - 10;

      setTooltip({ text, x: tooltipX, y: tooltipY, loading: true });

      try {
        const result = await Gemini.getTranslation(text);
        setTooltip(prev => prev ? { ...prev, ...result, loading: false } : null);
      } catch (err) {
        console.error("Translation error:", err);
        setTooltip(null);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (!window.getSelection()?.toString().trim()) {
        setTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadTopics = async () => {
      if (currentState !== AppState.TOPIC_SELECTION) return;
      setIsLoading(true);
      try {
        const categories = userPreferences.categories.length > 0
          ? userPreferences.categories
          : undefined;
        const fetchedTopics = await Gemini.generateTopics(categories);
        setTopics(fetchedTopics);
      } catch (error) {
        console.error(error);
        alert("Failed to load topics. Check API Key.");
      } finally {
        setIsLoading(false);
      }
    };
    loadTopics();
  }, [currentState, userPreferences.categories]);

  const handleTopicSelect = async (topic: string) => {
    setSelectedTopic(topic);
    setIsLoading(true);
    setCurrentState(AppState.BRIEFING_GENERATION);

    try {
      const content = await Gemini.generateBriefing(topic);
      setBriefing({ ...content, topic });

      const audio = await Gemini.generateSpeech(content.fullText);
      setBriefingAudio(audio);

      setCurrentState(AppState.LISTENING_PHASE);

      // Only play audio if available (not in demo mode)
      if (audio) {
        setTimeout(() => {
          playAudio(audio, playbackSpeed);
        }, 500);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate briefing.");
      setCurrentState(AppState.TOPIC_SELECTION);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBriefingPlayback = () => {
    if (isPlaying) {
      stopAudio();
    } else if (briefingAudio) {
      playAudio(briefingAudio, playbackSpeed);
    }
  };

  const startShadowing = () => {
    stopAudio();
    setCurrentState(AppState.SHADOWING_PHASE);
    setCurrentSentenceIndex(0);
    playCurrentSentence();
  };

  const playCurrentSentence = async () => {
    if (!briefing) return;
    const sentence = briefing.sentences[currentSentenceIndex];

    try {
      const audio = await Gemini.generateSpeech(sentence);
      if (audio) {
        playAudio(audio, playbackSpeed);
      }
    } catch (e) {
      console.error("Failed to play sentence audio", e);
    }
  };

  const handleShadowingRecording = async (blob: Blob) => {
    handleRecordingEnd();
    const url = URL.createObjectURL(blob);
    setUserRecordingUrl(url);
    setPendingBlob(blob);
  };

  const submitFeedbackRequest = async () => {
    if (!briefing || !pendingBlob) return;

    setIsLoading(true);
    try {
      const base64 = await blobToBase64(pendingBlob);
      const targetText = briefing.sentences[currentSentenceIndex];
      const feedback = await Gemini.analyzeShadowing(base64, targetText);
      setShadowingFeedback(feedback);

      const spokenFeedback = `You scored ${feedback.score}. ${feedback.feedback}. ${feedback.betterPronunciationTips}`;
      const feedbackAudio = await Gemini.generateSpeech(spokenFeedback);
      if (feedbackAudio) {
        playAudio(feedbackAudio, 1.0);
      }
    } catch (e) {
      console.error(e);
      alert("Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const retryCurrentSentence = () => {
    stopAudio();
    setShadowingFeedback(null);
    setUserRecordingUrl(null);
    setPendingBlob(null);
  };

  const nextSentence = () => {
    stopAudio();
    setShadowingFeedback(null);
    setUserRecordingUrl(null);
    setPendingBlob(null);

    if (!briefing) return;
    if (currentSentenceIndex < briefing.sentences.length - 1) {
      setCurrentSentenceIndex(prev => prev + 1);
      setTimeout(() => {
        const nextText = briefing.sentences[currentSentenceIndex + 1];
        Gemini.generateSpeech(nextText).then(audio => {
          if (audio) playAudio(audio, playbackSpeed);
        });
      }, 100);
    } else {
      startDiscussionPhase();
    }
  };

  const startDiscussionPhase = async () => {
    if (!briefing) return;
    setCurrentState(AppState.DISCUSSION_PHASE);
    setDiscussionAudio(null);
    setIsLoading(true);
    try {
      const question = await Gemini.generateDiscussionQuestion(briefing.topic, briefing.fullText);
      setDiscussionQuestion(question);
      setIsLoading(false);

      const audio = await Gemini.generateSpeech(question);
      setDiscussionAudio(audio);
      if (audio) {
        playAudio(audio, playbackSpeed);
      }
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  const handleDiscussionRecording = async (blob: Blob) => {
    handleRecordingEnd();
    setIsLoading(true);
    try {
      const base64 = await blobToBase64(blob);
      const feedback = await Gemini.analyzeDiscussionResponse(base64, discussionQuestion);
      setDiscussionFeedback(feedback);
      setCurrentState(AppState.DISCUSSION_FEEDBACK);
    } catch (e) {
      console.error(e);
      alert("Could not analyze response.");
    } finally {
      setIsLoading(false);
    }
  };

  // Render functions
  const renderOnboarding = () => {
    const [selectedCategories, setSelectedCategories] = useState<string[]>(userPreferences.categories);

    const toggleCategory = (categoryId: string) => {
      setSelectedCategories(prev =>
        prev.includes(categoryId)
          ? prev.filter(c => c !== categoryId)
          : [...prev, categoryId]
      );
    };

    const completeOnboarding = () => {
      const newPrefs: UserPreferences = {
        categories: selectedCategories,
        hasCompletedOnboarding: true,
      };
      setUserPreferences(newPrefs);
      savePreferences(newPrefs);
      setCurrentState(AppState.TOPIC_SELECTION);
    };

    return (
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 animate-in fade-in duration-500">
        <div className="text-center mb-8 sm:mb-12">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl sm:text-3xl mx-auto mb-4 sm:mb-6">
            NB
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3 sm:mb-4">Welcome to NativeBiz Coach</h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto px-4">
            Master business English through real-world news and AI-powered coaching
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">Select Your Interests</h2>
          <p className="text-sm sm:text-base text-slate-500 mb-6">Choose topics you&apos;d like to focus on (select at least one)</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {AVAILABLE_CATEGORIES.map(category => (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className={`p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                  selectedCategories.includes(category.id)
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl sm:text-3xl">{category.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-sm sm:text-base font-semibold ${
                      selectedCategories.includes(category.id) ? 'text-blue-700' : 'text-slate-800'
                    }`}>
                      {category.label}
                    </h3>
                  </div>
                  {selectedCategories.includes(category.id) && (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={completeOnboarding}
          disabled={selectedCategories.length === 0}
          className="w-full max-w-md mx-auto block"
        >
          {selectedCategories.length === 0 ? 'Select at least one category' : 'Get Started'}
        </Button>

        {userPreferences.hasCompletedOnboarding && (
          <button
            onClick={() => setCurrentState(AppState.TOPIC_SELECTION)}
            className="mt-4 text-sm text-slate-500 hover:text-slate-700 underline mx-auto block"
          >
            Skip to topics
          </button>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm sm:text-base">
          NB
        </div>
        <h1 className="text-base sm:text-lg font-bold text-slate-800">NativeBiz Coach</h1>
      </div>
      {briefing && (
        <div className="text-xs sm:text-sm font-medium text-slate-500 bg-slate-100 px-2 sm:px-3 py-1 rounded-full hidden md:block max-w-[200px] truncate">
          Topic: {briefing.topic}
        </div>
      )}
      {currentState !== AppState.ONBOARDING && userPreferences.hasCompletedOnboarding && (
        <button
          onClick={() => setCurrentState(AppState.ONBOARDING)}
          className="text-xs sm:text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1"
          title="Update preferences"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden sm:inline">Settings</span>
        </button>
      )}
    </header>
  );

  const renderTopicSelection = () => (
    <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 animate-in fade-in duration-500">
      <div className="text-center mb-8 sm:mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3">Today&apos;s Briefing Topics</h2>
        <p className="text-sm sm:text-base text-slate-500 px-4">Select a topic to begin your business English session.</p>
        {userPreferences.categories.length > 0 && (
          <div className="mt-3 sm:mt-4 flex flex-wrap gap-2 justify-center px-4">
            <span className="text-xs sm:text-sm text-slate-400">Your interests:</span>
            {userPreferences.categories.map(catId => {
              const cat = AVAILABLE_CATEGORIES.find(c => c.id === catId);
              return cat ? (
                <span key={catId} className="text-xs sm:text-sm bg-blue-50 text-blue-700 px-2 sm:px-3 py-1 rounded-full">
                  {cat.icon} {cat.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {isLoading && topics.length === 0 ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {topics.map((topic, i) => (
            <button
              key={i}
              onClick={() => handleTopicSelect(topic)}
              className="p-4 sm:p-6 bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 hover:-translate-y-1 transition-all duration-200 text-left group"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <span className="font-bold text-sm sm:text-base">{i + 1}</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 group-hover:text-blue-700">{topic}</h3>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderListeningPhase = () => (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 flex flex-col items-center min-h-[60vh] text-center space-y-4 sm:space-y-6 animate-in fade-in duration-500 relative">
      <div className="space-y-2 px-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Listen Carefully</h2>
        <p className="text-sm sm:text-base text-slate-500">Listen to the native intonation. Highlight any word to translate.</p>
      </div>

      <button
        onClick={toggleBriefingPlayback}
        className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center relative transition-all duration-300 ${isPlaying ? 'bg-red-50 text-red-500 ring-4 ring-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-4 ring-blue-50'}`}
      >
        <div className={`absolute inset-0 rounded-full border-2 ${isPlaying ? 'border-red-200 animate-ping' : 'border-transparent'}`}></div>
        {isPlaying ? (
          <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
        ) : (
          <svg className="w-10 h-10 sm:w-12 sm:h-12 translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>

      <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
        {[0.75, 1.0, 1.25].map((speed) => (
          <button
            key={speed}
            onClick={() => {
              setPlaybackSpeed(speed);
              if (currentSourceRef.current) {
                currentSourceRef.current.playbackRate.value = speed;
              }
            }}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${playbackSpeed === speed ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div
        className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm w-full text-left cursor-text selection:bg-blue-100 selection:text-blue-900"
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection}
      >
        <p className="text-base sm:text-lg text-slate-700 leading-relaxed font-serif">
          {briefing?.fullText}
        </p>
      </div>

      <Button onClick={startShadowing} className="w-full max-w-sm mx-auto">
        Start Shadowing Practice
      </Button>

      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-blue-200 shadow-2xl rounded-xl p-3 sm:p-4 max-w-[280px] sm:max-w-[320px] text-left animate-in fade-in zoom-in duration-200 pointer-events-auto"
          style={{
            left: `${Math.min(Math.max(tooltip.x, 140), typeof window !== 'undefined' ? window.innerWidth - 140 : 300)}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {tooltip.loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              Searching definition...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] sm:text-xs font-bold text-blue-600 uppercase tracking-wider">AI Translation</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">&quot;{tooltip.text}&quot;</span>
              </div>
              <p className="text-sm sm:text-base text-slate-900 font-bold border-b border-slate-100 pb-1">{tooltip.translation}</p>
              <p className="text-xs text-slate-600 italic leading-snug">{tooltip.definition}</p>
            </div>
          )}
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-blue-200 rotate-45"></div>
        </div>
      )}
    </div>
  );

  const renderShadowingPhase = () => (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 animate-in fade-in duration-500 h-full overflow-y-auto pb-20">
      <div className="flex justify-between items-center text-xs sm:text-sm text-slate-500 font-medium">
        <span>Sentence {currentSentenceIndex + 1} of {briefing?.sentences.length}</span>
        <button onClick={() => playCurrentSentence()} className="text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          <span className="hidden sm:inline">Replay Model</span> ({playbackSpeed}x)
        </button>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm min-h-[120px] sm:min-h-[160px] flex items-center justify-center text-center">
        <p className="text-lg sm:text-2xl font-serif text-slate-800 leading-relaxed">
          {briefing?.sentences[currentSentenceIndex]}
        </p>
      </div>

      <div className="bg-slate-50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200">
        {!userRecordingUrl && !shadowingFeedback && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm sm:text-base text-slate-500 mb-2">Repeat the sentence above clearly.</p>
            <Recorder
              onRecordingComplete={handleShadowingRecording}
              onStart={handleRecordingStart}
              isProcessing={isLoading}
            />
          </div>
        )}

        {userRecordingUrl && !shadowingFeedback && (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <div className="text-center">
              <h3 className="text-base sm:text-lg font-bold text-slate-700 mb-1">Recording Captured</h3>
              <p className="text-xs sm:text-sm text-slate-500">Listen to yourself or request feedback.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => new Audio(userRecordingUrl).play()}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button
                onClick={retryCurrentSentence}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors"
                title="Re-record"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>

            <Button onClick={submitFeedbackRequest} disabled={isLoading} className="w-full max-w-sm">
              {isLoading ? 'Analyzing...' : 'Request Feedback'}
            </Button>
          </div>
        )}

        {shadowingFeedback && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`text-3xl sm:text-4xl font-bold ${shadowingFeedback.score >= 8 ? 'text-green-600' : 'text-orange-500'}`}>
                {shadowingFeedback.score}/10
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide font-bold">You said:</p>
                <p className="text-sm sm:text-base text-slate-700 italic truncate">&quot;{shadowingFeedback.transcription}&quot;</p>
              </div>
            </div>

            {userRecordingUrl && (
              <div className="flex justify-center">
                <button
                  onClick={() => new Audio(userRecordingUrl).play()}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-2 border border-blue-200 bg-blue-50 px-2 sm:px-3 py-1 rounded-full"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Replay Your Recording
                </button>
              </div>
            )}

            <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-100">
              <h4 className="text-blue-800 font-semibold mb-1 text-xs sm:text-sm">Feedback</h4>
              <p className="text-blue-900 text-xs sm:text-sm">{shadowingFeedback.feedback}</p>
            </div>

            <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg border border-emerald-100">
              <h4 className="text-emerald-800 font-semibold mb-1 text-xs sm:text-sm">Pro Tip</h4>
              <p className="text-emerald-900 text-xs sm:text-sm">{shadowingFeedback.betterPronunciationTips}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2">
              <Button onClick={retryCurrentSentence} variant="outline">
                Try Again
              </Button>
              <Button onClick={nextSentence}>
                {currentSentenceIndex < (briefing?.sentences.length || 0) - 1 ? 'Next' : 'Discussion'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderDiscussionPhase = () => (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-6 sm:gap-8 animate-in fade-in duration-500">
      <div className="text-center space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Discussion Phase</h2>
        <p className="text-sm sm:text-base text-slate-500">Share your thoughts on the topic.</p>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <p className="text-[10px] sm:text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">Instructor Asks:</p>
        <p className="text-lg sm:text-xl font-medium text-slate-800">&quot;{discussionQuestion}&quot;</p>
        <button
          onClick={() => {
            if (discussionAudio) {
              playAudio(discussionAudio, playbackSpeed);
            } else {
              Gemini.generateSpeech(discussionQuestion).then(a => {
                setDiscussionAudio(a);
                playAudio(a, playbackSpeed);
              });
            }
          }}
          className="mt-3 text-xs sm:text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1"
        >
          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> Listen again
        </button>
      </div>

      {currentState === AppState.DISCUSSION_PHASE && (
        <div className="flex flex-col items-center">
          <Recorder
            onRecordingComplete={handleDiscussionRecording}
            onStart={handleRecordingStart}
            isProcessing={isLoading}
            label="Record Answer"
          />
        </div>
      )}

      {currentState === AppState.DISCUSSION_FEEDBACK && discussionFeedback && (
        <div className="bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4">Evaluation</h3>
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              <div className="bg-white p-3 sm:p-4 rounded-lg border border-slate-200">
                <span className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1">Native Phrasing</span>
                <p className="text-slate-800 text-base sm:text-lg font-medium">&quot;{discussionFeedback.betterAlternative}&quot;</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                <div className="bg-orange-50 p-3 sm:p-4 rounded-lg border border-orange-100">
                  <span className="block text-[10px] sm:text-xs font-bold text-orange-400 uppercase mb-1">Grammar & Correction</span>
                  <p className="text-orange-900 text-xs sm:text-sm">{discussionFeedback.grammarNotes}</p>
                </div>
                <div className="bg-indigo-50 p-3 sm:p-4 rounded-lg border border-indigo-100">
                  <span className="block text-[10px] sm:text-xs font-bold text-indigo-400 uppercase mb-1">Vocabulary Upgrade</span>
                  <p className="text-indigo-900 text-xs sm:text-sm">{discussionFeedback.vocabularySuggestions}</p>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => {
            setCurrentState(AppState.TOPIC_SELECTION);
            setBriefing(null);
            setShadowingFeedback(null);
            setDiscussionFeedback(null);
            setUserRecordingUrl(null);
            setBriefingAudio(null);
            setDiscussionAudio(null);
            setDiscussionQuestion('');
          }} variant="outline" className="w-full">
            Start New Session
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {renderHeader()}
      <main className="flex-1 overflow-y-auto">
        {currentState === AppState.ONBOARDING && renderOnboarding()}
        {currentState === AppState.TOPIC_SELECTION && renderTopicSelection()}
        {currentState === AppState.BRIEFING_GENERATION && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 animate-pulse px-4 py-20">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-sm sm:text-base text-center">Generating a professional briefing on {selectedTopic}...</p>
          </div>
        )}
        {currentState === AppState.LISTENING_PHASE && renderListeningPhase()}
        {currentState === AppState.SHADOWING_PHASE && renderShadowingPhase()}
        {(currentState === AppState.DISCUSSION_PHASE || currentState === AppState.DISCUSSION_FEEDBACK) && renderDiscussionPhase()}
      </main>
    </div>
  );
}
