/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ChatMessage, MessageSender, GeminiVoiceName, DocumentCitation } from '../types';
import { Volume2, Square, Loader2, FileText, ExternalLink, X, Check, Copy } from 'lucide-react';
import { generateTts } from '../services/geminiService';
import { playGeminiAudio, stopCurrentAudio } from '../services/audioPlayer';

// Configure marked to use highlight.js for syntax highlighting
marked.setOptions({
  highlight: function(code: string, lang: string) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
} as any);

interface MessageItemProps {
  message: ChatMessage;
  voiceName?: GeminiVoiceName;
}

interface NormalizedCitation {
  id: number;
  fileName: string;
  snippet: string;
  url?: string;
}

const SenderAvatar: React.FC<{ sender: MessageSender }> = ({ sender }) => {
  let avatarChar = '';
  let bgColorClass = '';
  let textColorClass = '';

  if (sender === MessageSender.USER) {
    avatarChar = 'U';
    bgColorClass = 'bg-white/[.12]';
    textColorClass = 'text-white';
  } else if (sender === MessageSender.MODEL) {
    avatarChar = 'AI';
    bgColorClass = 'bg-[#79B8FF]/20 text-[#79B8FF] border border-[#79B8FF]/30'; 
    textColorClass = 'text-[#79B8FF]';
  } else { // SYSTEM
    avatarChar = '⚙';
    bgColorClass = 'bg-[#3A3A3A]';
    textColorClass = 'text-[#A8ABB4]';
  }

  return (
    <div className={`w-8 h-8 rounded-full ${bgColorClass} ${textColorClass} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
      {avatarChar}
    </div>
  );
};

const CitationModal: React.FC<{
  citation: NormalizedCitation;
  onClose: () => void;
}> = ({ citation, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = () => {
    if (citation.snippet) {
      navigator.clipboard.writeText(citation.snippet).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#1E1E1E] border border-white/10 rounded-xl max-w-lg w-full p-5 shadow-2xl relative text-[#E2E2E2] flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#79B8FF]/20 text-[#79B8FF] text-xs font-bold border border-[#79B8FF]/40 flex-shrink-0">
              {citation.id}
            </span>
            <div className="min-w-0">
              <h3 id="citation-title" className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                <FileText size={15} className="text-[#79B8FF] flex-shrink-0" />
                <span className="truncate">{citation.fileName}</span>
              </h3>
              <p className="text-[11px] text-[#A8ABB4]">Referenced source document context</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A8ABB4] hover:text-white hover:bg-white/10 transition-colors"
            title="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Precise Blurb Content */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-[#A8ABB4] px-1 font-medium">
            <span>Precise Document Blurb</span>
            {citation.snippet && (
              <span className="text-[11px] text-[#A8ABB4]/70">
                {citation.snippet.length} characters
              </span>
            )}
          </div>
          <div className="bg-[#141414] border border-white/[0.08] rounded-lg p-3.5 max-h-64 overflow-y-auto font-mono text-xs text-[#D1D5DB] leading-relaxed whitespace-pre-wrap selection:bg-[#79B8FF]/30">
            {citation.snippet || "No additional text blurb available for this document citation."}
          </div>
        </div>

        {/* URL Link if available */}
        {citation.url && (
          <div className="flex items-center gap-2 text-xs text-[#79B8FF] bg-[#79B8FF]/10 p-2.5 rounded-lg border border-[#79B8FF]/20 truncate">
            <ExternalLink size={14} className="flex-shrink-0" />
            <a 
              href={citation.url} 
              target="_blank" 
              rel="noreferrer" 
              className="truncate hover:underline"
            >
              {citation.url}
            </a>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.08]">
          <button
            onClick={handleCopy}
            disabled={!citation.snippet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#E2E2E2] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all disabled:opacity-40"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Copied Blurb' : 'Copy Blurb'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[#79B8FF]/20 hover:bg-[#79B8FF]/30 border border-[#79B8FF]/40 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const MessageItem: React.FC<MessageItemProps> = ({ message, voiceName = 'Aoede' }) => {
  const isUser = message.sender === MessageSender.USER;
  const isModel = message.sender === MessageSender.MODEL;
  const isSystem = message.sender === MessageSender.SYSTEM;
  
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<NormalizedCitation | null>(null);

  // Extract and normalize citations from citations array or urlContextMetadata
  const citationsList: NormalizedCitation[] = React.useMemo(() => {
    if (message.citations && message.citations.length > 0) {
      return message.citations.map((c, idx) => ({
        id: c.id || idx + 1,
        fileName: c.fileName || c.title || `Document ${idx + 1}`,
        snippet: c.snippet,
      }));
    }

    if (message.urlContext && message.urlContext.length > 0) {
      return message.urlContext.map((item, idx) => ({
        id: idx + 1,
        fileName: item.title || item.retrievedUrl,
        snippet: item.snippet || item.retrievedUrl,
        url: item.retrievedUrl,
      }));
    }

    return [];
  }, [message.citations, message.urlContext]);

  const handleReadAloud = async () => {
    if (isPlayingTts || isLoadingTts) {
      stopCurrentAudio();
      setIsPlayingTts(false);
      setIsLoadingTts(false);
      return;
    }

    if (!message.text || message.isLoading) return;

    setIsLoadingTts(true);
    try {
      // Strip markdown symbols for natural TTS speech
      const plainText = message.text
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/[#*_~\[\]\(\)]/g, '')
        .trim();

      const { audio, mimeType } = await generateTts(plainText || message.text, voiceName);
      setIsLoadingTts(false);
      setIsPlayingTts(true);

      await playGeminiAudio(audio, mimeType);
    } catch (err) {
      console.warn("Gemini TTS failed, falling back to speech synthesis", err);
      setIsLoadingTts(false);
      if ('speechSynthesis' in window) {
        setIsPlayingTts(true);
        const utterance = new SpeechSynthesisUtterance(message.text);
        utterance.onend = () => setIsPlayingTts(false);
        utterance.onerror = () => setIsPlayingTts(false);
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setIsPlayingTts(false);
      setIsLoadingTts(false);
    }
  };

  const renderMessageContent = () => {
    if (isModel && !message.isLoading) {
      const proseClasses = "prose prose-sm prose-invert w-full min-w-0"; 
      const rawMarkup = marked.parse(message.text || "") as string;
      return (
        <div>
          <div className="flex justify-end mb-1">
            <button 
              onClick={handleReadAloud} 
              className={`p-1 rounded-md transition-colors ${
                isPlayingTts 
                  ? 'text-[#79B8FF] bg-[#79B8FF]/10' 
                  : 'text-[#A8ABB4] hover:text-[#79B8FF] hover:bg-white/5'
              }`}
              title={isPlayingTts ? "Stop reading" : `Read aloud (${voiceName} voice)`}
            >
              {isLoadingTts ? (
                <Loader2 size={15} className="animate-spin text-[#79B8FF]" />
              ) : isPlayingTts ? (
                <Square size={14} className="fill-current" />
              ) : (
                <Volume2 size={15} />
              )}
            </button>
          </div>
          <div className={proseClasses} dangerouslySetInnerHTML={{ __html: rawMarkup }} />

          {/* Numbered Citation Bubbles Only */}
          {citationsList.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-white/[0.08] flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-[#A8ABB4]/80 font-medium mr-1 select-none">
                Sources:
              </span>
              {citationsList.map((cit) => (
                <button
                  key={cit.id}
                  onClick={() => setSelectedCitation(cit)}
                  title={`Source [${cit.id}]: ${cit.fileName}\nClick to view precise document excerpt`}
                  className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold text-[#79B8FF] bg-[#79B8FF]/15 hover:bg-[#79B8FF]/30 border border-[#79B8FF]/30 hover:border-[#79B8FF]/60 rounded-full transition-all duration-150 transform hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                >
                  {cit.id}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    let textColorClass = '';
    if (isUser) {
        textColorClass = 'text-white';
    } else if (isSystem) {
        textColorClass = 'text-[#A8ABB4] text-xs font-mono';
    } else {
        textColorClass = 'text-[#E2E2E2]';
    }
    return <div className={`whitespace-pre-wrap text-sm ${textColorClass}`}>{message.text}</div>;
  };
  
  let bubbleClasses = "p-3 rounded-lg shadow w-full ";

  if (isUser) {
    bubbleClasses += "bg-white/[.12] text-white rounded-br-none";
  } else if (isModel) {
    bubbleClasses += `bg-[rgba(119,119,119,0.10)] border-t border-[rgba(255,255,255,0.04)] backdrop-blur-lg rounded-bl-none`;
  } else { // System message
    bubbleClasses += "bg-[#252525] border border-[rgba(255,255,255,0.06)] text-[#A8ABB4] rounded-bl-none";
  }

  return (
    <>
      <div className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex items-start gap-2 max-w-[85%]`}>
          {!isUser && <SenderAvatar sender={message.sender} />}
          <div className={bubbleClasses}>
            {renderMessageContent()}
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[10px] text-[#A8ABB4]/70">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          {isUser && <SenderAvatar sender={message.sender} />}
        </div>
      </div>

      {/* Precise Blurb Modal */}
      {selectedCitation && (
        <CitationModal
          citation={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />
      )}
    </>
  );
};

export default MessageItem;
