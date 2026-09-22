/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Volume2, Sparkles, Check, Play, Loader2, RotateCcw } from 'lucide-react';
import { AppSettings, GeminiVoiceName } from '../types';
import { generateTts } from '../services/geminiService';
import { playGeminiAudio, stopCurrentAudio } from '../services/audioPlayer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
}

const VOICE_OPTIONS: { id: GeminiVoiceName; name: string; desc: string; tone: string }[] = [
  { id: 'Aoede', name: 'Aoede', desc: 'Melodic, clear, and engaging (Recommended Default)', tone: 'Clear & Natural' },
  { id: 'Kore', name: 'Kore', desc: 'Warm, reassuring, and pleasant', tone: 'Warm & Friendly' },
  { id: 'Puck', name: 'Puck', desc: 'Lively, energetic, and expressive', tone: 'Dynamic & Bright' },
  { id: 'Charon', name: 'Charon', desc: 'Deep, steady, and authoritative', tone: 'Deep & Calm' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Crisp, articulate, and focused', tone: 'Crisp & Direct' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Gentle, smooth, and conversational', tone: 'Smooth & Relaxed' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  voiceName: 'Aoede',
  systemPersona: 'You are an intelligent RAG knowledge base assistant. Answer questions thoroughly and accurately using the provided documents in focus. Ground all factual assertions in the referenced texts.',
  autoPlayTts: false,
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoiceName>(settings.voiceName || 'Aoede');
  const [persona, setPersona] = useState<string>(settings.systemPersona || DEFAULT_SETTINGS.systemPersona);
  const [autoPlay, setAutoPlay] = useState<boolean>(settings.autoPlayTts || false);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestVoice = async (voice: GeminiVoiceName) => {
    if (testingVoice) {
      stopCurrentAudio();
      setTestingVoice(null);
      return;
    }

    setTestingVoice(voice);
    try {
      const sampleText = `Hello! I am ${voice}, your RAG voice assistant. I am ready to explore your knowledge base.`;
      const res = await generateTts(sampleText, voice);
      if (res.audio) {
        await playGeminiAudio(res.audio, res.mimeType);
      }
    } catch (err) {
      console.warn("Test voice failed, using browser synthesis fallback", err);
      if ('speechSynthesis' in window) {
        const utt = new SpeechSynthesisUtterance(`Hello! Voice ${voice} preview.`);
        window.speechSynthesis.speak(utt);
      }
    } finally {
      setTestingVoice(null);
    }
  };

  const handleSave = () => {
    stopCurrentAudio();
    onSaveSettings({
      voiceName: selectedVoice,
      systemPersona: persona,
      autoPlayTts: autoPlay,
    });
    onClose();
  };

  const handleReset = () => {
    setSelectedVoice(DEFAULT_SETTINGS.voiceName);
    setPersona(DEFAULT_SETTINGS.systemPersona);
    setAutoPlay(DEFAULT_SETTINGS.autoPlayTts);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#1E1E1E] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex justify-between items-center bg-[#252525]">
          <div className="flex items-center gap-2.5">
            <Volume2 className="text-[#79B8FF]" size={20} />
            <h3 className="font-semibold text-[#E2E2E2] text-lg">System & Voice Settings</h3>
          </div>
          <button
            onClick={() => {
              stopCurrentAudio();
              onClose();
            }}
            className="p-1 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm text-[#E2E2E2]">
          {/* AI Voice Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-medium text-sm text-white flex items-center gap-1.5">
                <span>AI Voice Persona</span>
                <span className="text-xs text-[#79B8FF] font-normal">Active for Live Voice & Read Aloud</span>
              </label>
            </div>
            <p className="text-xs text-[#A8ABB4] mb-3">
              Select the voice model used across the entire RAG knowledge base.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {VOICE_OPTIONS.map((v) => {
                const isSelected = selectedVoice === v.id;
                const isTesting = testingVoice === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVoice(v.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#79B8FF] bg-[#79B8FF]/10 text-white shadow-xs'
                        : 'border-[rgba(255,255,255,0.06)] bg-[#2C2C2C] hover:bg-[#343434] text-[#E2E2E2]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#79B8FF] bg-[#79B8FF]' : 'border-[#666]'}`}>
                        {isSelected && <Check size={12} className="text-black stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          <span>{v.name}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[#A8ABB4]">
                            {v.tone}
                          </span>
                        </div>
                        <p className="text-xs text-[#A8ABB4] mt-0.5">{v.desc}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestVoice(v.id);
                      }}
                      className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-[#E2E2E2] flex items-center gap-1.5 transition-colors flex-shrink-0"
                      title="Preview sample audio"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-[#79B8FF]" />
                          <span>Playing</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} className="text-[#79B8FF]" />
                          <span>Preview</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RAG Persona / System Prompt */}
          <div>
            <label className="block font-medium text-sm text-white mb-1">
              RAG Knowledge Base Persona / Instructions
            </label>
            <p className="text-xs text-[#A8ABB4] mb-2">
              Custom instructions guiding how the agent analyzes and cites your active documents.
            </p>
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={3}
              className="w-full p-3 bg-[#2C2C2C] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-[#E2E2E2] placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none transition-colors"
              placeholder="e.g., You are a meticulous technical documentation assistant..."
            />
          </div>

          {/* Auto-Play Option */}
          <div className="flex items-center justify-between p-3 bg-[#2C2C2C] border border-[rgba(255,255,255,0.06)] rounded-lg">
            <div>
              <span className="font-medium text-sm text-white">Auto-Read AI Replies</span>
              <p className="text-xs text-[#A8ABB4] mt-0.5">
                Automatically speak incoming written answers aloud in the selected voice.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoPlay(!autoPlay)}
              className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${autoPlay ? 'bg-[#79B8FF]' : 'bg-[#4A4A4A]'}`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${autoPlay ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.08)] bg-[#252525] flex justify-between items-center">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-[#A8ABB4] hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                stopCurrentAudio();
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-[#3A3A3A] hover:bg-[#454545] text-xs font-medium text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-[#79B8FF] hover:bg-[#68a7f0] text-xs font-semibold text-black transition-colors"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
