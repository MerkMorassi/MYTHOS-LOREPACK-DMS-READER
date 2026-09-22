/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MessageSender, LocalFile } from '../types'; 
import MessageItem from './MessageItem';
import { Send, Menu, Trash2, Download, Settings, Mic, MicOff, Search, Loader2, X, FileText, Layers, Check, ChevronDown, ChevronUp, AlertCircle, Eye, EyeOff, CloudUpload, History } from 'lucide-react';
import { GoogleDriveExportModal } from './GoogleDriveExportModal';
import { ChatHistorySearchModal } from './ChatHistorySearchModal';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (query: string) => void;
  isLoading: boolean;
  placeholderText?: string;
  initialQuerySuggestions?: string[];
  onSuggestedQueryClick?: (query: string) => void;
  isFetchingSuggestions?: boolean;
  onToggleSidebar?: () => void;
  onClearChat?: () => void;
  onExportChat?: () => void;
  onOpenSettings?: () => void;
  voiceName?: import('../types').GeminiVoiceName;
  // Live Voice props
  isLiveConnected?: boolean;
  isLiveConnecting?: boolean;
  isLiveMuted?: boolean;
  onToggleLiveChat?: () => void;
  onToggleLiveMute?: () => void;
  liveError?: string | null;
  onDismissLiveError?: () => void;
  onOpenLiveChat?: () => void;
  // RAG Focus Context props
  focusedFiles?: LocalFile[];
  allFiles?: LocalFile[];
  activeGroupName?: string;
  onToggleFileFocus?: (fileName: string) => void;
  onToggleAllFocus?: (focus: boolean) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  isLoading, 
  placeholderText,
  initialQuerySuggestions,
  onSuggestedQueryClick,
  isFetchingSuggestions,
  onToggleSidebar,
  onClearChat,
  onExportChat,
  onOpenSettings,
  voiceName = 'Aoede',
  isLiveConnected = false,
  isLiveConnecting = false,
  isLiveMuted = false,
  onToggleLiveChat,
  onToggleLiveMute,
  liveError,
  onDismissLiveError,
  onOpenLiveChat,
  focusedFiles = [],
  allFiles = [],
  activeGroupName = 'Default Knowledge Base',
  onToggleFileFocus,
  onToggleAllFocus,
}) => {
  const [userQuery, setUserQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const [isDriveExportOpen, setIsDriveExportOpen] = useState(false);
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleLive = onToggleLiveChat || onOpenLiveChat;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = () => {
    if (userQuery.trim() && (!isLoading || isLiveConnected)) {
      onSendMessage(userQuery.trim());
      setUserQuery('');
    }
  };

  const showSuggestions = initialQuerySuggestions && initialQuerySuggestions.length > 0 && messages.filter(m => m.sender !== MessageSender.SYSTEM).length <= 1;
  const focusedCount = focusedFiles.length;
  const totalFilesCount = allFiles.length;

  return (
    <div className="flex flex-col h-full bg-[#1E1E1E] rounded-xl shadow-md border border-[rgba(255,255,255,0.05)] relative">
      {/* Top Header Bar */}
      <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
           {onToggleSidebar && (
            <button 
              onClick={onToggleSidebar}
              className="p-1.5 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
              aria-label="Open knowledge base"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-semibold text-[#E2E2E2]">Documentation Browser</h2>
              
              {/* Visual Real-time RAG Context Badge */}
              <button
                onClick={() => setIsContextDrawerOpen(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  focusedCount > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                }`}
                title={focusedCount > 0 ? "Click to view and manage active RAG documents" : "No documents in focus. Click to select documents."}
                aria-label="Toggle RAG context details"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  focusedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`} />
                <span>RAG Context:</span>
                <span className="font-semibold tabular-nums">{focusedCount}</span>
                <span className="hidden sm:inline">{focusedCount === 1 ? 'doc active' : 'docs active'}</span>
                {isContextDrawerOpen ? <ChevronUp size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
              </button>
            </div>
            
            {placeholderText && messages.filter(m => m.sender !== MessageSender.SYSTEM).length === 0 && (
               <p className="text-xs text-[#A8ABB4] mt-0.5 max-w-md truncate" title={placeholderText}>{placeholderText}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative mr-1">
            <input
              type="text"
              placeholder="Search chat..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] text-[#E2E2E2] placeholder-[#777777] rounded-md focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] text-xs w-32 sm:w-40 transition-colors"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-[#A8ABB4]" />
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 text-[#A8ABB4] hover:text-[#79B8FF] rounded-md hover:bg-[#79B8FF]/10 transition-colors flex items-center justify-center"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          )}
          <button
            onClick={() => setIsHistorySearchOpen(true)}
            className="p-1.5 text-[#A8ABB4] hover:text-[#79B8FF] rounded-md hover:bg-[#79B8FF]/10 transition-colors flex items-center gap-1.5 text-sm font-medium"
            aria-label="Search chat history archive"
            title="Search past chat history"
          >
            <History size={16} />
            <span className="hidden sm:inline">Archive</span>
          </button>
          {onExportChat && messages.length > 1 && (
            <button
              onClick={onExportChat}
              className="p-1.5 text-[#A8ABB4] hover:text-[#79B8FF] rounded-md hover:bg-[#79B8FF]/10 transition-colors flex items-center gap-1.5 text-sm font-medium"
              aria-label="Export chat"
              title="Export chat"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
          <button
            onClick={() => setIsDriveExportOpen(true)}
            className="p-1.5 text-[#4285F4] hover:text-white rounded-md hover:bg-[#4285F4]/20 transition-colors flex items-center gap-1.5 text-sm font-medium border border-[#4285F4]/30"
            aria-label="Save logs and chat history to Google Drive"
            title="Save chat and logs to Google Drive"
          >
            <CloudUpload size={16} />
            <span className="hidden sm:inline">Save to G Drive</span>
          </button>
          {onClearChat && messages.length > 1 && (
            <button
              onClick={onClearChat}
              className="p-1.5 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex items-center gap-1.5 text-sm font-medium"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-time RAG Grounding Context Sub-Header Strip */}
      <div className="bg-[#191919] border-b border-[rgba(255,255,255,0.05)] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 text-[#79B8FF] font-medium shrink-0">
            <Layers size={13} className="shrink-0" />
            <span className="text-[#A8ABB4]">{activeGroupName}:</span>
          </div>

          {focusedCount > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap overflow-hidden">
              {focusedFiles.slice(0, 4).map((file) => (
                <div 
                  key={file.name}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#252836] border border-[#3B82F6]/30 text-[#93C5FD] max-w-[160px] sm:max-w-[200px]"
                  title={`${file.name} (Active in RAG grounding)`}
                >
                  <FileText size={11} className="shrink-0 text-[#79B8FF]" />
                  <span className="truncate">{file.name}</span>
                  {onToggleFileFocus && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFileFocus(file.name);
                      }}
                      className="text-[#93C5FD]/60 hover:text-[#f87171] p-0.5 rounded transition-colors ml-0.5"
                      title={`Remove "${file.name}" from active focus`}
                      aria-label={`Unfocus ${file.name}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}

              {focusedCount > 4 && (
                <button
                  onClick={() => setIsContextDrawerOpen(true)}
                  className="px-2 py-0.5 rounded bg-[#2A2A2A] hover:bg-[#333333] text-[#A8ABB4] hover:text-white border border-white/10 transition-colors font-medium tabular-nums"
                  title="View all focused documents"
                >
                  +{focusedCount - 4} more
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400/90">
              <AlertCircle size={13} className="shrink-0" />
              <span>No documents currently in focus. Queries will not use document retrieval.</span>
            </div>
          )}
        </div>

        {/* Quick Context Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {totalFilesCount > 0 && onToggleAllFocus && (
            focusedCount === totalFilesCount ? (
              <button
                onClick={() => onToggleAllFocus(false)}
                className="text-xs text-[#A8ABB4] hover:text-white hover:underline transition-colors"
                title="Exclude all documents from RAG"
              >
                Unfocus All
              </button>
            ) : (
              <button
                onClick={() => onToggleAllFocus(true)}
                className="text-xs text-[#79B8FF] hover:text-[#93C5FD] hover:underline transition-colors"
                title="Include all documents in RAG grounding"
              >
                Focus All ({totalFilesCount})
              </button>
            )
          )}
          
          <button
            onClick={() => setIsContextDrawerOpen(prev => !prev)}
            className="text-xs text-[#A8ABB4] hover:text-white px-2 py-0.5 rounded bg-[#2C2C2C] hover:bg-[#383838] border border-white/5 transition-colors flex items-center gap-1"
          >
            <span>{isContextDrawerOpen ? "Hide Details" : "Manage"}</span>
            {isContextDrawerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expandable Document Context Popover / Drawer */}
      {isContextDrawerOpen && (
        <div className="bg-[#1C1D24] border-b border-[#3B82F6]/20 p-4 shadow-xl z-10 transition-all">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[#79B8FF]" />
                <h3 className="text-sm font-semibold text-[#E2E2E2]">
                  Active RAG Grounding Documents ({focusedCount} / {totalFilesCount} Active)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {onToggleAllFocus && totalFilesCount > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleAllFocus(true)}
                      className="px-2.5 py-1 text-xs font-medium rounded bg-[#2A2A2A] hover:bg-[#353535] text-[#79B8FF] border border-white/10 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onToggleAllFocus(false)}
                      className="px-2.5 py-1 text-xs font-medium rounded bg-[#2A2A2A] hover:bg-[#353535] text-[#A8ABB4] hover:text-white border border-white/10 transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setIsContextDrawerOpen(false)}
                  className="p-1 text-[#A8ABB4] hover:text-white rounded hover:bg-white/10 transition-colors"
                  aria-label="Close document context drawer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {totalFilesCount === 0 ? (
              <div className="py-6 text-center text-sm text-[#A8ABB4]">
                <p>No documents uploaded in this collection yet.</p>
                {onToggleSidebar && (
                  <button
                    onClick={() => {
                      setIsContextDrawerOpen(false);
                      onToggleSidebar();
                    }}
                    className="mt-2 text-xs text-[#79B8FF] hover:underline font-medium"
                  >
                    Open Knowledge Base to upload files →
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3 max-h-52 overflow-y-auto pr-1">
                {allFiles.map((file) => {
                  const isInFocus = file.inFocus !== false;
                  return (
                    <div
                      key={file.name}
                      onClick={() => onToggleFileFocus && onToggleFileFocus(file.name)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isInFocus
                          ? 'bg-[#252836] border-[#3B82F6]/40 text-[#E2E2E2] shadow-sm'
                          : 'bg-[#222222] border-white/5 text-[#888888] hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 mr-2">
                        <FileText size={14} className={isInFocus ? "text-[#79B8FF] shrink-0" : "text-[#666666] shrink-0"} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" title={file.name}>
                            {file.name}
                          </p>
                          <span className="text-[10px] text-[#A8ABB4] tabular-nums">
                            {file.content ? `${Math.round(file.content.length / 1000)}k chars` : '0 chars'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="shrink-0 flex items-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isInFocus 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-white/5 text-[#777777]'
                        }`}>
                          {isInFocus ? 'In Focus' : 'Excluded'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-grow p-4 overflow-y-auto chat-container bg-[#282828]">
        {/* New wrapper for max-width and centering */}
        <div className="max-w-4xl mx-auto w-full">
          {messages.filter(m => !filterQuery || m.text?.toLowerCase().includes(filterQuery.toLowerCase())).map((msg) => (
            <MessageItem key={msg.id} message={msg} voiceName={voiceName} />
          ))}
          
          {isFetchingSuggestions && (
              <div className="flex justify-center items-center p-3">
                  <div className="flex items-center space-x-1.5 text-[#A8ABB4]">
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                      <span className="text-sm">Fetching suggestions...</span>
                  </div>
              </div>
          )}

          {showSuggestions && onSuggestedQueryClick && (
            <div className="my-3 px-1">
              <p className="text-xs text-[#A8ABB4] mb-1.5 font-medium">Or try one of these: </p>
              <div className="flex flex-wrap gap-1.5">
                {initialQuerySuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onSuggestedQueryClick(suggestion)}
                    className="bg-[#79B8FF]/10 text-[#79B8FF] px-2.5 py-1 rounded-full text-xs hover:bg-[#79B8FF]/20 transition-colors shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(255,255,255,0.05)] bg-[#1E1E1E] rounded-b-xl">
        {/* Live Voice Error Banner */}
        {liveError && (
          <div className="mb-2.5 px-3 py-1.5 bg-red-900/40 border border-red-500/40 rounded-lg flex items-center justify-between text-xs text-red-200">
            <span className="truncate mr-2">{liveError}</span>
            {onDismissLiveError && (
              <button
                onClick={onDismissLiveError}
                className="text-red-300 hover:text-white flex-shrink-0"
                aria-label="Dismiss error"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Live Voice Connected Status Bar */}
        {isLiveConnected && (
          <div className="mb-2.5 px-3 py-1.5 bg-[#79B8FF]/10 border border-[#79B8FF]/25 rounded-lg flex items-center justify-between text-xs text-[#E2E2E2]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#79B8FF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#79B8FF]"></span>
              </span>
              <span className="font-medium text-[#79B8FF]">Live Voice Connected</span>
              <span className="text-[#A8ABB4] hidden sm:inline">• Speak or type simultaneously</span>
            </div>
            <div className="flex items-center gap-2">
              {onToggleLiveMute && (
                <button
                  onClick={onToggleLiveMute}
                  className={`p-1 rounded transition-colors ${
                    isLiveMuted
                      ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                      : 'text-[#A8ABB4] hover:text-white hover:bg-white/10'
                  }`}
                  title={isLiveMuted ? 'Unmute microphone' : 'Mute microphone'}
                  aria-label={isLiveMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isLiveMuted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
              <button
                onClick={toggleLive}
                className="text-[#A8ABB4] hover:text-white hover:bg-white/10 px-2 py-0.5 rounded transition-colors text-[11px]"
                title="Disconnect live voice"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {toggleLive && (
            <button
              id="live-voice-toggle-btn"
              onClick={toggleLive}
              className={`p-2 rounded-full transition-all duration-200 flex-shrink-0 flex items-center justify-center ${
                isLiveConnected
                  ? 'bg-[#79B8FF] text-[#121212] ring-4 ring-[#79B8FF]/30 shadow-lg shadow-[#79B8FF]/20 scale-105'
                  : isLiveConnecting
                  ? 'bg-[#79B8FF]/20 text-[#79B8FF] animate-pulse ring-2 ring-[#79B8FF]/40'
                  : 'text-[#79B8FF] hover:bg-[#79B8FF]/10'
              }`}
              title={
                isLiveConnected
                  ? 'Live Voice Active (Click to disconnect)'
                  : isLiveConnecting
                  ? 'Connecting to live voice...'
                  : 'Connect to live voice chat'
              }
              aria-label={
                isLiveConnected
                  ? 'Disconnect live voice chat'
                  : isLiveConnecting
                  ? 'Connecting to live voice chat'
                  : 'Connect to live voice chat'
              }
            >
              {isLiveConnecting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Mic size={18} />
              )}
            </button>
          )}
          <textarea
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder={
              isLiveConnected
                ? 'Speak out loud or type a message...'
                : (placeholderText || 'Ask about the documents...')
            }
            className="flex-grow h-8 min-h-[32px] py-1.5 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow resize-none text-sm"
            rows={1}
            disabled={!isLiveConnected && (isLoading || isFetchingSuggestions)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={(!isLiveConnected && (isLoading || isFetchingSuggestions)) || !userQuery.trim()}
            className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777] flex items-center justify-center flex-shrink-0"
            aria-label="Send message"
          >
            {(isLoading && !isLiveConnected && messages[messages.length-1]?.isLoading && messages[messages.length-1]?.sender === MessageSender.MODEL) ? 
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
              : <Send size={16} />
            }
          </button>
        </div>
      </div>

      {/* Google Drive Export Modal */}
      <GoogleDriveExportModal
        isOpen={isDriveExportOpen}
        onClose={() => setIsDriveExportOpen(false)}
        chatMessages={messages}
        systemPersona={voiceName} // or systemPersona
      />

      {/* Chat History Archive Search Modal */}
      <ChatHistorySearchModal
        isOpen={isHistorySearchOpen}
        onClose={() => setIsHistorySearchOpen(false)}
      />
    </div>
  );
};

export default ChatInterface;
