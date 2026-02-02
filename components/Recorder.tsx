import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';

interface RecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onStart?: () => void;
  isProcessing?: boolean;
  label?: string;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onStart, isProcessing, label = "Tap to Speak" }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const startRecording = async () => {
    onStart?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Visualizer
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      // Setup Recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' }); // Standard webm or wav depending on browser
        onRecordingComplete(blob);
        stream.getTracks().forEach(track => track.stop());
        cancelAnimationFrame(animationRef.current!);
      };

      mediaRecorder.start();
      setIsRecording(true);
      visualize();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const visualize = () => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);
      
      const barWidth = (width / dataArray.length) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(${barHeight + 100}, 50, 230)`; // Purple/Pink vibe
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 w-full">
      <div className="relative w-full h-20 sm:h-24 bg-slate-900 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
        {!isRecording && !isProcessing && (
           <span className="text-slate-400 text-xs sm:text-sm">Waveform Visualization</span>
        )}
        <canvas ref={canvasRef} width={300} height={100} className="w-full h-full absolute inset-0" style={{ maxWidth: '100%' }} />
      </div>

      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-300 touch-manipulation ${
          isRecording 
            ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)] scale-110' 
            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-lg'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isProcessing ? (
           <div className="w-6 h-6 sm:w-8 sm:h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : isRecording ? (
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-md"></div>
        ) : (
          <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
      <span className="text-xs sm:text-sm font-medium text-slate-600 text-center px-4">
        {isRecording ? "Listening... Tap to Stop" : label}
      </span>
    </div>
  );
};
