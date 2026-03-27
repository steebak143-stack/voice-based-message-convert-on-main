/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  Volume2,
  Sparkles,
  Clock,
  History,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { transcribeAudio, summarizeMessage } from './services/gemini';

interface VoiceMessage {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: Date;
  transcription?: string;
  summary?: string;
  isTranscribing?: boolean;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Setup Visualizer
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateVisualizer = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average);
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const newMessage: VoiceMessage = {
          id: Math.random().toString(36).substr(2, 9),
          blob: audioBlob,
          url: audioUrl,
          duration: recordingTime,
          timestamp: new Date(),
          isTranscribing: true
        };

        setMessages(prev => [newMessage, ...prev]);
        processAI(newMessage);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setAudioLevel(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const processAI = async (message: VoiceMessage) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(message.blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const transcription = await transcribeAudio(base64Audio, 'audio/webm');
        const summary = await summarizeMessage(transcription);

        setMessages(prev => prev.map(m => 
          m.id === message.id 
            ? { ...m, transcription, summary, isTranscribing: false } 
            : m
        ));
      };
    } catch (error) {
      console.error("AI Processing failed:", error);
      setMessages(prev => prev.map(m => 
        m.id === message.id ? { ...m, isTranscribing: false } : m
      ));
    }
  };

  const togglePlayback = (message: VoiceMessage) => {
    if (activeMessageId === message.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(message.url);
      audioRef.current = audio;
      setActiveMessageId(message.id);
      setIsPlaying(true);
      audio.play();
      audio.onended = () => {
        setIsPlaying(false);
        setActiveMessageId(null);
      };
    }
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    if (activeMessageId === id) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setActiveMessageId(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-[#1A1A1A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(242,125,38,0.3)]">
            <Mic className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">VoiceCover</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Professional Audio Capture</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors text-[#666] hover:text-white">
            <History className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors text-[#666] hover:text-white">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-40 px-6 max-w-2xl mx-auto">
        {/* Empty State */}
        {messages.length === 0 && !isRecording && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div className="w-20 h-20 border-2 border-dashed border-[#333] rounded-full flex items-center justify-center mb-6">
              <Volume2 className="w-8 h-8 text-[#666]" />
            </div>
            <h2 className="text-xl font-light mb-2">No messages yet</h2>
            <p className="text-sm max-w-[240px]">Record your first voice message to see AI transcription in action.</p>
          </div>
        )}

        {/* Message List */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative bg-[#111] border border-[#1A1A1A] rounded-2xl overflow-hidden hover:border-[#333] transition-all duration-300"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => togglePlayback(msg)}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                          activeMessageId === msg.id && isPlaying 
                            ? "bg-[#F27D26] text-white" 
                            : "bg-[#1A1A1A] text-[#666] hover:text-white hover:bg-[#222]"
                        )}
                      >
                        {activeMessageId === msg.id && isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-[#666] uppercase tracking-wider mb-1">
                          <Clock className="w-3 h-3" />
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          <span className="mx-1">•</span>
                          {formatTime(msg.duration)}
                        </div>
                        <h3 className="font-medium text-white">Voice Message</h3>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteMessage(msg.id)}
                      className="p-2 text-[#444] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* AI Content */}
                  <div className="space-y-3">
                    {msg.isTranscribing ? (
                      <div className="flex items-center gap-2 text-xs text-[#666] animate-pulse">
                        <Sparkles className="w-3 h-3" />
                        AI is transcribing...
                      </div>
                    ) : (
                      <>
                        {msg.summary && (
                          <div className="bg-[#1A1A1A] rounded-xl p-3 border-l-2 border-[#F27D26]">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-[#F27D26] uppercase tracking-widest mb-1">
                              <Sparkles className="w-3 h-3" />
                              AI Summary
                            </div>
                            <p className="text-sm text-[#BBB] leading-relaxed italic">
                              "{msg.summary}"
                            </p>
                          </div>
                        )}
                        {msg.transcription && (
                          <div className="text-sm text-[#888] leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                            {msg.transcription}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {/* Progress Bar (Mock) */}
                {activeMessageId === msg.id && isPlaying && (
                  <motion.div 
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: msg.duration, ease: "linear" }}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#F27D26] origin-left"
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* Recording Interface - Recipe 3 Inspired */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-all duration-500",
        isRecording ? "h-64" : "h-32"
      )}>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none" />
        
        <div className="relative h-full max-w-2xl mx-auto px-6 flex flex-col items-center justify-center">
          {/* Visualizer */}
          <AnimatePresence>
            {isRecording && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="w-full flex items-end justify-center gap-1 h-12 mb-6"
              >
                {[...Array(24)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: Math.max(4, (audioLevel * (Math.sin(i * 0.5) + 1.5)) / 2) + "%" 
                    }}
                    className="w-1 bg-[#F27D26] rounded-full opacity-60"
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-8">
            {isRecording && (
              <div className="text-2xl font-mono font-medium text-white tabular-nums tracking-tighter w-24 text-right">
                {formatTime(recordingTime)}
              </div>
            )}

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "relative group w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500",
                isRecording 
                  ? "bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110" 
                  : "bg-[#F27D26] shadow-[0_0_30px_rgba(242,125,38,0.3)] hover:scale-105"
              )}
            >
              {isRecording ? (
                <Square className="w-8 h-8 text-white fill-current" />
              ) : (
                <Mic className="w-8 h-8 text-white" />
              )}
              
              {/* Pulse effect when recording */}
              {isRecording && (
                <motion.div 
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 rounded-full bg-red-500 -z-10"
                />
              )}
            </button>

            {isRecording && (
              <div className="flex flex-col items-start w-24">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">Recording</span>
                <span className="text-[10px] text-[#666] uppercase tracking-widest">Live Audio</span>
              </div>
            )}
          </div>
          
          {!isRecording && (
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[#444] font-bold">
              Tap to record message
            </p>
          )}
        </div>
      </div>

      {/* Background Atmosphere */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#F27D26]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#F27D26]/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
