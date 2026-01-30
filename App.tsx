import React, { useState, useEffect, useRef } from 'react';
import { AppState, BriefingContent, ShadowingFeedback, DiscussionFeedback } from './types';
import * as Gemini from './services/geminiService';
import { decodeAudioData, blobToBase64 } from './utils/audioUtils';
import { Button } from './components/Button';
import { Recorder } from './components/Recorder';

const App: React.FC = () => {
  const [currentState, setCurrentState] = useState<AppState>(AppState.TOPIC_SELECTION);
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
  
  // Audio State
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [briefingAudio, setBriefingAudio] = useState<string | null>(null);
  const [discussionAudio, setDiscussionAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Translation Tooltip State
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    translation?: string;
    definition?: string;
    loading: boolean;
  } | null>(null);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isUserRecordingRef = useRef<boolean>(false);

  // Initialize Audio Context (user interaction required)
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playAudio = async (base64: string, speed: number = 1.0, onEnded?: () => void) => {
    initAudio();
    if (!audioContextRef.current) return;

    stopAudio(); // Stop any currently playing audio

    if (isUserRecordingRef.current) {
        return;
    }

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
          try { currentSourceRef.current.stop(); } catch(e) {}
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

  // Text Selection / Translation Logic
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

  // Dismiss tooltip when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (!window.getSelection()?.toString().trim()) {
        setTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Topic Selection
  useEffect(() => {
    const loadTopics = async () => {
      setIsLoading(true);
      try {
        const fetchedTopics = await Gemini.generateTopics();
        setTopics(fetchedTopics);
      } catch (error) {
        console.error(error);
        alert("Failed to load topics. Check API Key.");
      } finally {
        setIsLoading(false);
      }
    };
    loadTopics();
  }, []);

  const handleTopicSelect = async (topic: string) => {
    setSelectedTopic(topic);
    setIsLoading(true);
    setCurrentState(AppState.BRIEFING_GENERATION);
    
    try {
      const content = await Gemini.generateBriefing(topic);
      setBriefing({...content, topic});
      
      const audio = await Gemini.generateSpeech(content.fullText);
      setBriefingAudio(audio);
      
      setCurrentState(AppState.LISTENING_PHASE);
      
      setTimeout(() => {
          playAudio(audio, playbackSpeed);
      }, 500);

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
        playAudio(audio, playbackSpeed);
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
      playAudio(feedbackAudio, 1.0); 

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
             Gemini.generateSpeech(nextText).then(audio => playAudio(audio, playbackSpeed));
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
          playAudio(audio, playbackSpeed);
      } catch(e) {
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
      } catch(e) {
          console.error(e);
          alert("Could not analyze response.");
      } finally {
          setIsLoading(false);
      }
  };

  // --- RENDER HELPERS ---

  const renderHeader = () => (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            NB
        </div>
        <h1 className="text-lg font-bold text-slate-800">NativeBiz Coach</h1>
      </div>
      {briefing && (
          <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full hidden sm:block">
              Topic: {briefing.topic}
          </div>
      )}
    </header>
  );

  const renderTopicSelection = () => (
    <div className="max-w-4xl mx-auto w-full p-6 animate-fade-in">
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-800 mb-3">Today's Briefing Topics</h2>
            <p className="text-slate-500">Select a topic to begin your business English session.</p>
        </div>
        
        {isLoading && topics.length === 0 ? (
            <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topics.map((topic, i) => (
                    <button
                        key={i}
                        onClick={() => handleTopicSelect(topic)}
                        className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 hover:-translate-y-1 transition-all duration-200 text-left group"
                    >
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                           <span className="font-bold">{i + 1}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 group-hover:text-blue-700">{topic}</h3>
                    </button>
                ))}
            </div>
        )}
    </div>
  );

  const renderListeningPhase = () => (
      <div className="max-w-2xl mx-auto w-full p-6 flex flex-col items-center min-h-[60vh] text-center space-y-6 animate-fade-in relative">
          <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">Listen Carefully</h2>
              <p className="text-slate-500">Listen to the native intonation. Highlight any word to translate.</p>
          </div>

          <button 
            onClick={toggleBriefingPlayback}
            className={`w-32 h-32 rounded-full flex items-center justify-center relative transition-all duration-300 ${isPlaying ? 'bg-red-50 text-red-500 ring-4 ring-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-4 ring-blue-50'}`}
          >
               <div className={`absolute inset-0 rounded-full border-2 ${isPlaying ? 'border-red-200 animate-ping' : 'border-transparent'}`}></div>
               {isPlaying ? (
                   <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
               ) : (
                   <svg className="w-12 h-12 translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
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
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${playbackSpeed === speed ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                      {speed}x
                  </button>
              ))}
          </div>

          <div 
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full text-left cursor-text selection:bg-blue-100 selection:text-blue-900"
            onMouseUp={handleTextSelection}
          >
              <p className="text-lg text-slate-700 leading-relaxed font-serif">
                  {briefing?.fullText}
              </p>
          </div>

          <Button onClick={startShadowing} className="w-full max-w-sm mx-auto">
              Start Shadowing Practice
          </Button>

          {/* Translation Tooltip */}
          {tooltip && (
            <div 
              className="absolute z-50 bg-white border border-blue-200 shadow-2xl rounded-xl p-4 max-w-[280px] text-left animate-in fade-in zoom-in duration-200 pointer-events-auto"
              style={{ 
                left: `${tooltip.x}px`, 
                top: `${tooltip.y}px`, 
                transform: 'translate(-50%, -100%)' 
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {tooltip.loading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Searching definition...
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">AI Translation</span>
                    <span className="text-[10px] text-slate-400 font-mono">"{tooltip.text}"</span>
                  </div>
                  <p className="text-slate-900 font-bold border-b border-slate-100 pb-1">{tooltip.translation}</p>
                  <p className="text-xs text-slate-600 italic leading-snug">{tooltip.definition}</p>
                </div>
              )}
              {/* Arrow */}
              <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-blue-200 rotate-45"></div>
            </div>
          )}
      </div>
  );

  const renderShadowingPhase = () => (
      <div className="max-w-2xl mx-auto w-full p-6 flex flex-col gap-6 animate-fade-in h-full overflow-y-auto pb-20">
          <div className="flex justify-between items-center text-sm text-slate-500 font-medium">
              <span>Sentence {currentSentenceIndex + 1} of {briefing?.sentences.length}</span>
              <button onClick={() => playCurrentSentence()} className="text-blue-600 hover:underline flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  Replay Model ({playbackSpeed}x)
              </button>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm min-h-[160px] flex items-center justify-center text-center">
              <p className="text-2xl font-serif text-slate-800 leading-relaxed">
                  {briefing?.sentences[currentSentenceIndex]}
              </p>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
               {!userRecordingUrl && !shadowingFeedback && (
                   <div className="flex flex-col items-center gap-4">
                       <p className="text-slate-500 mb-2">Repeat the sentence above clearly.</p>
                       <Recorder 
                         onRecordingComplete={handleShadowingRecording} 
                         onStart={handleRecordingStart} 
                         isProcessing={isLoading} 
                       />
                   </div>
               )}

               {userRecordingUrl && !shadowingFeedback && (
                   <div className="flex flex-col items-center gap-6">
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Recording Captured</h3>
                            <p className="text-sm text-slate-500">Listen to yourself or request feedback.</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                             <button 
                                onClick={() => new Audio(userRecordingUrl).play()}
                                className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                             >
                                <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                             </button>
                             <button 
                                onClick={retryCurrentSentence} 
                                className="w-12 h-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors"
                                title="Re-record"
                             >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                             </button>
                        </div>

                        <Button onClick={submitFeedbackRequest} isLoading={isLoading} className="w-full max-w-sm">
                            Request Feedback
                        </Button>
                   </div>
               )}

               {shadowingFeedback && (
                   <div className="space-y-6">
                       <div className="flex items-center gap-4">
                           <div className={`text-4xl font-bold ${shadowingFeedback.score >= 8 ? 'text-green-600' : 'text-orange-500'}`}>
                               {shadowingFeedback.score}/10
                           </div>
                           <div className="flex-1">
                               <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">You said:</p>
                               <p className="text-slate-700 italic">"{shadowingFeedback.transcription}"</p>
                           </div>
                       </div>

                       {userRecordingUrl && (
                           <div className="flex justify-center">
                               <button 
                                   onClick={() => new Audio(userRecordingUrl).play()}
                                   className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-1 rounded-full"
                               >
                                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                   Replay Your Recording
                               </button>
                           </div>
                       )}
                       
                       <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                           <h4 className="text-blue-800 font-semibold mb-1 text-sm">Feedback</h4>
                           <p className="text-blue-900 text-sm">{shadowingFeedback.feedback}</p>
                       </div>

                       <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                           <h4 className="text-emerald-800 font-semibold mb-1 text-sm">Pro Tip</h4>
                           <p className="text-emerald-900 text-sm">{shadowingFeedback.betterPronunciationTips}</p>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-3 pt-2">
                           <Button onClick={retryCurrentSentence} variant="secondary">
                               Try Again
                           </Button>
                           <Button onClick={nextSentence}>
                               {currentSentenceIndex < (briefing?.sentences.length || 0) - 1 ? 'Next Sentence' : 'Discussion'}
                           </Button>
                       </div>
                   </div>
               )}
          </div>
      </div>
  );

  const renderDiscussionPhase = () => (
      <div className="max-w-2xl mx-auto w-full p-6 flex flex-col gap-8 animate-fade-in">
          <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-slate-800">Discussion Phase</h2>
              <p className="text-slate-500">Share your thoughts on the topic.</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
               <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">Instructor Asks:</p>
               <p className="text-xl font-medium text-slate-800">"{discussionQuestion}"</p>
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
                 className="mt-3 text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1"
               >
                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Listen again
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
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-6">
                   <div>
                       <h3 className="text-lg font-bold text-slate-800 mb-2">Evaluation</h3>
                       <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                                <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Native Phrasing</span>
                                <p className="text-slate-800 text-lg font-medium">"{discussionFeedback.betterAlternative}"</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <span className="block text-xs font-bold text-orange-400 uppercase mb-1">Grammar & Correction</span>
                                    <p className="text-orange-900 text-sm">{discussionFeedback.grammarNotes}</p>
                                </div>
                                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                    <span className="block text-xs font-bold text-indigo-400 uppercase mb-1">Vocabulary Upgrade</span>
                                    <p className="text-indigo-900 text-sm">{discussionFeedback.vocabularySuggestions}</p>
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
                   }} variant="secondary" className="w-full">
                       Start New Session
                   </Button>
              </div>
          )}
      </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {renderHeader()}
      <main className="flex-1 overflow-y-auto">
        {currentState === AppState.TOPIC_SELECTION && renderTopicSelection()}
        {currentState === AppState.BRIEFING_GENERATION && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 animate-pulse">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <p>Generating a professional briefing on {selectedTopic}...</p>
            </div>
        )}
        {currentState === AppState.LISTENING_PHASE && renderListeningPhase()}
        {currentState === AppState.SHADOWING_PHASE && renderShadowingPhase()}
        {(currentState === AppState.DISCUSSION_PHASE || currentState === AppState.DISCUSSION_FEEDBACK) && renderDiscussionPhase()}
      </main>
    </div>
  );
};

export default App;