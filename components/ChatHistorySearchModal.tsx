/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Search, History, Loader2, Calendar, User, Bot, MessageSquare } from 'lucide-react';
import { ChatMessage, MessageSender } from '../types';
import { loadChatMessages } from '../services/dbService';

interface ChatHistorySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (message: ChatMessage) => void;
}

export const ChatHistorySearchModal: React.FC<ChatHistorySearchModalProps> = ({
  isOpen,
  onClose,
  onSelectMessage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen]);

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      const stored = await loadChatMessages();
      setMessages(stored || []);
    } catch (err) {
      console.warn("Failed to load chat history from IndexedDB:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery.trim()) return true;
    return msg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
           msg.sender.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#1E1E1E] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex justify-between items-center bg-[#252525]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#79B8FF]/20 text-[#79B8FF] flex items-center justify-center border border-[#79B8FF]/30">
              <History size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-[#E2E2E2] text-base">Chat History Archive</h3>
              <p className="text-xs text-[#A8ABB4]">Search & browse past chat entries stored in IndexedDB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] bg-[#1A1A1A]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888]" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past messages, keywords, or queries..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-[#E2E2E2] placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Content List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-[#A8ABB4]">
              <Loader2 className="animate-spin text-[#79B8FF]" size={28} />
              <p className="text-xs">Loading chat history from IndexedDB...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-2 text-[#A8ABB4] text-center">
              <MessageSquare size={32} className="opacity-40" />
              <p className="text-sm font-medium text-white">No matching chat entries found</p>
              <p className="text-xs">Try a different search term or start chatting in the main session.</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isUser = msg.sender === MessageSender.USER;
              const dateStr = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    if (onSelectMessage) {
                      onSelectMessage(msg);
                    }
                    onClose();
                  }}
                  className="p-3.5 rounded-lg bg-[#252525] border border-[rgba(255,255,255,0.06)] hover:border-[#79B8FF]/40 cursor-pointer transition-all space-y-1.5 group"
                >
                  <div className="flex items-center justify-between text-xs text-[#A8ABB4]">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        isUser ? 'bg-[#79B8FF]/10 text-[#79B8FF] border border-[#79B8FF]/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {isUser ? <User size={12} /> : <Bot size={12} />}
                        <span>{isUser ? 'User' : 'Assistant'}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      <span>{dateStr}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#E2E2E2] line-clamp-3 group-hover:text-white transition-colors">
                    {msg.text}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[rgba(255,255,255,0.08)] bg-[#252525] flex justify-between items-center text-xs text-[#A8ABB4]">
          <span>{filteredMessages.length} message(s) found in IndexedDB archive</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#3A3A3A] hover:bg-[#454545] text-xs font-medium text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
