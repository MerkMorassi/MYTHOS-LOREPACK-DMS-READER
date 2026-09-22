/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, MessageSender, FileGroup, LocalFile, AppSettings } from './types';
import { generateContentWithUrlContext, getInitialSuggestions, generateTts } from './services/geminiService';
import { saveFileGroups, loadFileGroups, saveChatMessages, loadChatMessages } from './services/dbService';
import KnowledgeBaseManager from './components/KnowledgeBaseManager';
import ChatInterface from './components/ChatInterface';
import SettingsModal, { DEFAULT_SETTINGS } from './components/SettingsModal';
import { useLiveVoice } from './hooks/useLiveVoice';
import { playGeminiAudio } from './services/audioPlayer';

const INITIAL_FILE_GROUPS: FileGroup[] = [
  { id: 'custom-docs', name: 'Custom Documents 1', files: [] },
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `custom-docs-${i + 2}`,
    name: `Custom Documents ${i + 2}`,
    files: []
  }))
];

const App: React.FC = () => {
  const [fileGroups, setFileGroups] = useState<FileGroup[]>(INITIAL_FILE_GROUPS);
  const [activeFileGroupId, setActiveFileGroupId] = useState<string>(INITIAL_FILE_GROUPS[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('mythos_app_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [initialQuerySuggestions, setInitialQuerySuggestions] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const activeGroup = fileGroups.find(group => group.id === activeFileGroupId);
  const currentFilesForChat = activeGroup ? activeGroup.files : [];
  const focusedFilesForChat = currentFilesForChat.filter(f => f.inFocus !== false);

  const currentUserVoiceMsgIdRef = useRef<string | null>(null);
  const currentModelVoiceMsgIdRef = useRef<string | null>(null);

  const handleUserSpeech = useCallback((incomingText: string) => {
    if (!incomingText || !incomingText.trim()) return;

    currentModelVoiceMsgIdRef.current = null;

    setChatMessages(prevMessages => {
      const activeMsgId = currentUserVoiceMsgIdRef.current;
      if (!activeMsgId || !prevMessages.some(m => m.id === activeMsgId)) {
        const newId = `user-spoken-${Date.now()}`;
        currentUserVoiceMsgIdRef.current = newId;
        return [
          ...prevMessages,
          {
            id: newId,
            text: incomingText,
            sender: MessageSender.USER,
            timestamp: new Date(),
          },
        ];
      } else {
        return prevMessages.map(msg => {
          if (msg.id === activeMsgId) {
            const updated =
              msg.text.endsWith(incomingText) || incomingText.startsWith(msg.text)
                ? incomingText
                : msg.text + (msg.text.endsWith(' ') || incomingText.startsWith(' ') ? '' : ' ') + incomingText;
            return { ...msg, text: updated };
          }
          return msg;
        });
      }
    });
  }, []);

  const handleModelSpeech = useCallback((incomingText: string) => {
    if (!incomingText) return;

    currentUserVoiceMsgIdRef.current = null;

    setChatMessages(prevMessages => {
      const activeMsgId = currentModelVoiceMsgIdRef.current;
      if (!activeMsgId || !prevMessages.some(m => m.id === activeMsgId)) {
        const newId = `model-spoken-${Date.now()}`;
        currentModelVoiceMsgIdRef.current = newId;
        return [
          ...prevMessages,
          {
            id: newId,
            text: incomingText,
            sender: MessageSender.MODEL,
            timestamp: new Date(),
            isLoading: false,
          },
        ];
      } else {
        return prevMessages.map(msg => {
          if (msg.id === activeMsgId) {
            const updated =
              msg.text.endsWith(incomingText) || incomingText.startsWith(msg.text)
                ? incomingText
                : msg.text + incomingText;
            return { ...msg, text: updated };
          }
          return msg;
        });
      }
    });
  }, []);

  const {
    isConnected: isLiveConnected,
    isConnecting: isLiveConnecting,
    isMuted: isLiveMuted,
    error: liveError,
    connect: connectLiveVoice,
    disconnect: disconnectLiveVoice,
    toggleMute: toggleLiveMute,
    sendTextMessage: sendLiveTextMessage,
    updateDocumentContext,
    clearError: clearLiveError,
  } = useLiveVoice({
    files: focusedFilesForChat,
    voiceName: appSettings.voiceName,
    systemPersona: appSettings.systemPersona,
    onUserSpeech: handleUserSpeech,
    onModelSpeech: handleModelSpeech,
    onTurnComplete: () => {
      currentUserVoiceMsgIdRef.current = null;
      currentModelVoiceMsgIdRef.current = null;
    },
    onInterrupted: () => {
      currentModelVoiceMsgIdRef.current = null;
    },
  });

  // Load from IndexedDB on mount
  useEffect(() => {
    const initDb = async () => {
      try {
        const storedGroups = await loadFileGroups();
        if (storedGroups && storedGroups.length > 0) {
          const mergedGroups = INITIAL_FILE_GROUPS.map(initGroup => {
            const existing = storedGroups.find(g => g.id === initGroup.id);
            return existing ? { ...existing, name: initGroup.name } : initGroup;
          });
          const additionalGroups = storedGroups.filter(
            sg => !INITIAL_FILE_GROUPS.some(ig => ig.id === sg.id)
          );
          
          const finalGroups = [...mergedGroups, ...additionalGroups];
          setFileGroups(finalGroups);
          setActiveFileGroupId(finalGroups[0].id);
        }

        const storedMessages = await loadChatMessages();
        if (storedMessages && storedMessages.length > 0) {
          setChatMessages(storedMessages);
        }
      } catch (err) {
        console.error("Failed to load data from IndexedDB", err);
      } finally {
        setIsInitialized(true);
      }
    };
    initDb();
  }, []);

  // Save File Groups to IndexedDB on change
  useEffect(() => {
    if (isInitialized) {
      saveFileGroups(fileGroups).catch(err => console.error("Failed to save file groups", err));
    }
  }, [fileGroups, isInitialized]);

  // Save Chat Messages to IndexedDB on change
  useEffect(() => {
    if (isInitialized) {
      saveChatMessages(chatMessages).catch(err => console.error("Failed to save chat messages", err));
    }
  }, [chatMessages, isInitialized]);

  useEffect(() => {
    // Only set default welcome message if chat is empty after initialization
    if (isInitialized && chatMessages.length === 0) {
      const currentActiveGroup = fileGroups.find(group => group.id === activeFileGroupId);
      const welcomeMessageText = `Welcome to Documentation Browser! You're currently browsing content from: "${currentActiveGroup?.name || 'None'}". Just ask me questions, or try one of the suggestions below to get started.`;
      
      setChatMessages([{
        id: `system-welcome-${activeFileGroupId}-${Date.now()}`,
        text: welcomeMessageText,
        sender: MessageSender.SYSTEM,
        timestamp: new Date(),
      }]);
    }
  }, [activeFileGroupId, fileGroups, isInitialized, chatMessages.length]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    try {
      localStorage.setItem('mythos_app_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn("Failed to persist settings to localStorage", e);
    }
  };

  const notifyContextUpdate = (updatedFiles: LocalFile[]) => {
    const focused = updatedFiles.filter(f => f.inFocus !== false);
    if (isLiveConnected) {
      updateDocumentContext(focused);
      setChatMessages(prev => [
        ...prev,
        {
          id: `system-context-update-${Date.now()}`,
          text: `🔔 System: Knowledge base context updated — ${focused.length} document(s) now in focus for the AI Agent.`,
          sender: MessageSender.SYSTEM,
          timestamp: new Date(),
        }
      ]);
    }
  };

  const fetchAndSetInitialSuggestions = useCallback(async (currentFiles: LocalFile[]) => {
    if (currentFiles.length === 0) {
      setInitialQuerySuggestions([]);
      return;
    }
      
    setIsFetchingSuggestions(true);
    setInitialQuerySuggestions([]); 

    try {
      const response = await getInitialSuggestions(currentFiles); 
      let suggestionsArray: string[] = [];
      if (response.text) {
        try {
          let jsonStr = response.text.trim();
          const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s; 
          const match = jsonStr.match(fenceRegex);
          if (match && match[2]) {
            jsonStr = match[2].trim();
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed && Array.isArray(parsed.suggestions)) {
            suggestionsArray = parsed.suggestions.filter((s: unknown) => typeof s === 'string');
          } else {
            console.warn("Parsed suggestions response, but 'suggestions' array not found or invalid:", parsed);
          }
        } catch (parseError) {
          console.error("Failed to parse suggestions JSON:", parseError, "Raw text:", response.text);
        }
      }
      setInitialQuerySuggestions(suggestionsArray.slice(0, 4)); 
    } catch (e: any) {
      console.warn('Failed to fetch initial suggestions. The feature will be disabled.', e);
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []); 

  useEffect(() => {
    if (focusedFilesForChat.length > 0) { 
        fetchAndSetInitialSuggestions(focusedFilesForChat);
    } else {
        setInitialQuerySuggestions([]); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilesForChat, fetchAndSetInitialSuggestions]); 

  const handleAddFiles = (newFiles: LocalFile[]) => {
    const mappedNewFiles = newFiles.map(f => ({ ...f, inFocus: true }));

    setFileGroups(prevGroups => 
      prevGroups.map(group => {
        if (group.id === activeFileGroupId) {
          const updatedFiles = [...group.files];
          mappedNewFiles.forEach(nf => {
            const existingIndex = updatedFiles.findIndex(f => f.name === nf.name);
            if (existingIndex >= 0) {
              updatedFiles[existingIndex] = {
                ...updatedFiles[existingIndex],
                content: nf.content,
                inFocus: true,
              };
            } else {
              updatedFiles.push(nf);
            }
          });
          notifyContextUpdate(updatedFiles);
          return { ...group, files: updatedFiles };
        }
        return group;
      })
    );
  };

  const handleRemoveFile = (fileNameToRemove: string) => {
    setFileGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeFileGroupId) {
          const updatedFiles = group.files.filter(file => file.name !== fileNameToRemove);
          notifyContextUpdate(updatedFiles);
          return { ...group, files: updatedFiles };
        }
        return group;
      })
    );
  };

  const handleToggleFileFocus = (fileName: string) => {
    setFileGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeFileGroupId) {
          const updatedFiles = group.files.map(file => 
            file.name === fileName ? { ...file, inFocus: !(file.inFocus !== false) } : file
          );
          notifyContextUpdate(updatedFiles);
          return { ...group, files: updatedFiles };
        }
        return group;
      })
    );
  };

  const handleToggleAllFocus = (focus: boolean) => {
    setFileGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeFileGroupId) {
          const updatedFiles = group.files.map(file => ({ ...file, inFocus: focus }));
          notifyContextUpdate(updatedFiles);
          return { ...group, files: updatedFiles };
        }
        return group;
      })
    );
  };

  const handleRenameGroup = (id: string, newName: string) => {
    setFileGroups(prevGroups => 
      prevGroups.map(group => 
        group.id === id ? { ...group, name: newName } : group
      )
    );
  };

  const handleClearChat = () => {
    const currentActiveGroup = fileGroups.find(group => group.id === activeFileGroupId);
    const welcomeMessageText = `Welcome to Documentation Browser! You're currently browsing content from: "${currentActiveGroup?.name || 'None'}". Just ask me questions, or try one of the suggestions below to get started.`;
    
    setChatMessages([{
      id: `system-welcome-${activeFileGroupId}-${Date.now()}`,
      text: welcomeMessageText,
      sender: MessageSender.SYSTEM,
      timestamp: new Date(),
    }]);
  };

  const handleExportChat = () => {
    if (chatMessages.length === 0) return;
    
    const content = chatMessages.map(msg => {
      const sender = msg.sender === MessageSender.USER ? 'User' : (msg.sender === MessageSender.MODEL ? 'Assistant' : 'System');
      const time = new Date(msg.timestamp).toLocaleString();
      return `### ${sender} - ${time}\n\n${msg.text}\n`;
    }).join('\n---\n\n');
    
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async (query: string) => {
    if (isLiveConnected) {
      currentUserVoiceMsgIdRef.current = null;
      currentModelVoiceMsgIdRef.current = null;
      setInitialQuerySuggestions([]);

      const userMessage: ChatMessage = {
        id: `user-text-${Date.now()}`,
        text: query,
        sender: MessageSender.USER,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, userMessage]);

      sendLiveTextMessage(query);
      return;
    }

    if (isLoading || isFetchingSuggestions) return;

    setIsLoading(true);
    setInitialQuerySuggestions([]); 

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      text: query,
      sender: MessageSender.USER,
      timestamp: new Date(),
    };
    
    const modelPlaceholderMessage: ChatMessage = {
      id: `model-response-${Date.now()}`,
      text: 'Thinking...', 
      sender: MessageSender.MODEL,
      timestamp: new Date(),
      isLoading: true,
    };

    setChatMessages(prevMessages => [...prevMessages, userMessage, modelPlaceholderMessage]);

    try {
      const response = await generateContentWithUrlContext(query, focusedFilesForChat, appSettings.systemPersona, chatMessages, appSettings.userPersona);
      const replyText = response.text || "I've reviewed the documents, but couldn't find a matching answer for this query.";
      
      setChatMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === modelPlaceholderMessage.id
            ? { 
                ...modelPlaceholderMessage, 
                text: replyText, 
                isLoading: false, 
                urlContext: response.urlContextMetadata,
                citations: response.citations,
              }
            : msg
        )
      );

      // Auto-play TTS if enabled in user settings
      if (appSettings.autoPlayTts && replyText) {
        generateTts(replyText, appSettings.voiceName)
          .then(res => playGeminiAudio(res.audio, res.mimeType))
          .catch(err => console.warn("Auto-play TTS error:", err));
      }
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to get response from AI.';
      setChatMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === modelPlaceholderMessage.id
            ? { ...modelPlaceholderMessage, text: `Error: ${errorMessage}`, sender: MessageSender.SYSTEM, isLoading: false } 
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQueryClick = (query: string) => {
    handleSendMessage(query);
  };
  
  const chatPlaceholder = focusedFilesForChat.length > 0 
    ? `Ask questions about ${focusedFilesForChat.length} active document(s)...`
    : "No documents currently in focus. Select or add documents in the sidebar to begin.";

  return (
    <div 
      className="h-screen max-h-screen antialiased relative overflow-x-hidden bg-[#121212] text-[#E2E2E2]"
    >
      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      <div className="flex h-full w-full md:p-4 md:gap-4">
        {/* Sidebar */}
        <div className={`
          fixed top-0 left-0 h-full w-11/12 max-w-sm z-30 transform transition-transform ease-in-out duration-300 p-3
          md:static md:p-0 md:w-1/3 lg:w-1/4 md:h-full md:max-w-none md:translate-x-0 md:z-auto
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <KnowledgeBaseManager
            files={currentFilesForChat}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            fileGroups={fileGroups}
            activeFileGroupId={activeFileGroupId}
            onSetGroupId={setActiveFileGroupId}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onToggleFileFocus={handleToggleFileFocus}
            onToggleAllFocus={handleToggleAllFocus}
            onRenameGroup={handleRenameGroup}
          />
        </div>

        {/* Chat Interface */}
        <div className="w-full h-full p-3 md:p-0 md:w-2/3 lg:w-3/4">
          <ChatInterface
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholderText={chatPlaceholder}
            initialQuerySuggestions={initialQuerySuggestions}
            onSuggestedQueryClick={handleSuggestedQueryClick}
            isFetchingSuggestions={isFetchingSuggestions}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onClearChat={handleClearChat}
            onExportChat={handleExportChat}
            voiceName={appSettings.voiceName}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isLiveConnected={isLiveConnected}
            isLiveConnecting={isLiveConnecting}
            isLiveMuted={isLiveMuted}
            onToggleLiveChat={isLiveConnected || isLiveConnecting ? disconnectLiveVoice : connectLiveVoice}
            onToggleLiveMute={toggleLiveMute}
            liveError={liveError}
            onDismissLiveError={clearLiveError}
            focusedFiles={focusedFilesForChat}
            allFiles={currentFilesForChat}
            activeGroupName={activeGroup?.name || 'Knowledge Base'}
            onToggleFileFocus={handleToggleFileFocus}
            onToggleAllFocus={handleToggleAllFocus}
          />
        </div>
      </div>

      {/* Settings Modal */}
      {(() => {
        const totalDocuments = fileGroups.reduce((acc, g) => acc + g.files.length, 0);
        const totalFileChars = fileGroups.reduce((acc, g) => acc + g.files.reduce((fa, f) => fa + (f.content?.length || 0), 0), 0);
        const totalChatChars = chatMessages.reduce((acc, m) => acc + (m.text?.length || 0), 0);
        const estimatedTokens = Math.round((totalFileChars + totalChatChars) / 4);

        return (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={appSettings}
            onSaveSettings={handleSaveSettings}
            totalDocuments={totalDocuments}
            estimatedTokens={estimatedTokens}
          />
        );
      })()}
    </div>
  );
};

export default App;
