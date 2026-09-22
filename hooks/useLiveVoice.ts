import { useState, useRef, useEffect, useCallback } from 'react';
import { LocalFile, GeminiVoiceName } from '../types';

export interface UseLiveVoiceOptions {
  files: LocalFile[];
  voiceName?: GeminiVoiceName;
  systemPersona?: string;
  onUserSpeech?: (text: string) => void;
  onModelSpeech?: (text: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
}

export function useLiveVoice({
  files,
  voiceName = 'Aoede',
  systemPersona,
  onUserSpeech,
  onModelSpeech,
  onTurnComplete,
  onInterrupted,
}: UseLiveVoiceOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Connection retry management
  const isExplicitDisconnectRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const MAX_RETRIES = 5;

  // Context synchronization tracking
  const pendingContextRef = useRef<LocalFile[]>(files);
  const isSetupCompleteRef = useRef<boolean>(false);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Keep latest callbacks in refs
  const onUserSpeechRef = useRef(onUserSpeech);
  const onModelSpeechRef = useRef(onModelSpeech);
  const onTurnCompleteRef = useRef(onTurnComplete);
  const onInterruptedRef = useRef(onInterrupted);
  const filesRef = useRef(files);
  const voiceNameRef = useRef(voiceName);
  const systemPersonaRef = useRef(systemPersona);

  useEffect(() => {
    onUserSpeechRef.current = onUserSpeech;
    onModelSpeechRef.current = onModelSpeech;
    onTurnCompleteRef.current = onTurnComplete;
    onInterruptedRef.current = onInterrupted;
    filesRef.current = files;
    voiceNameRef.current = voiceName;
    systemPersonaRef.current = systemPersona;
  }, [onUserSpeech, onModelSpeech, onTurnComplete, onInterrupted, files, voiceName, systemPersona]);

  // Immediately synchronize document context when files prop changes
  useEffect(() => {
    pendingContextRef.current = files;
    if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'updateContext',
        files: files,
      }));
    }
  }, [files, isConnected]);

  const pcmToBase64 = (f32: Float32Array): string => {
    const buffer = new ArrayBuffer(f32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const stopAllAudio = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const playAudioChunk = (base64: string) => {
    const outputCtx = outputAudioCtxRef.current;
    if (!outputCtx || outputCtx.state === 'closed') return;

    try {
      const binary = atob(base64);
      const f32 = new Float32Array(binary.length / 2);
      for (let i = 0; i < f32.length; i++) {
        const int = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
        const signed = int >= 32768 ? int - 65536 : int;
        f32[i] = signed / 32768;
      }

      const buffer = outputCtx.createBuffer(1, f32.length, 24000);
      buffer.getChannelData(0).set(f32);

      const source = outputCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(outputCtx.destination);

      if (nextStartTimeRef.current < outputCtx.currentTime) {
        nextStartTimeRef.current = outputCtx.currentTime;
      }
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;

      activeSourcesRef.current.add(source);
      source.onended = () => {
        activeSourcesRef.current.delete(source);
      };
    } catch (err) {
      console.warn('Error playing audio chunk:', err);
    }
  };

  const cleanupAudio = (preserveMicStream = false) => {
    stopAllAudio();
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {}
      processorRef.current = null;
    }
    if (!preserveMicStream && mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      try {
        inputAudioCtxRef.current.close().catch(() => {});
      } catch (e) {}
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      try {
        outputAudioCtxRef.current.close().catch(() => {});
      } catch (e) {}
      outputAudioCtxRef.current = null;
    }
  };

  const clearHeartbeat = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  };

  const disconnect = useCallback((manual = true) => {
    if (manual) {
      isExplicitDisconnectRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryCountRef.current = 0;
    }

    clearHeartbeat();
    isSetupCompleteRef.current = false;

    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    cleanupAudio(!manual);
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(async (isRetryAttempt = false) => {
    if (!isRetryAttempt) {
      isExplicitDisconnectRef.current = false;
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }

    if (isConnected || (isConnecting && !isRetryAttempt)) return;

    setIsConnecting(true);
    setError(null);

    try {
      // 1. Initialize Web Audio Contexts
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtxClass({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;

      const outputCtx = new AudioCtxClass({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }

      // 2. Request / verify microphone stream
      let stream = mediaStreamRef.current;
      const hasLiveTracks = stream && stream.getAudioTracks().some(t => t.readyState === 'live');

      if (!hasLiveTracks) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
      }

      // 3. Connect WebSocket to /live
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send setup packet with current context files, voice, and system instructions
        const activeFiles = pendingContextRef.current || filesRef.current;
        ws.send(JSON.stringify({
          type: 'setup',
          files: activeFiles,
          voice: voiceNameRef.current || 'Aoede',
          systemPersona: systemPersonaRef.current,
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'pong') {
            return;
          }

          if (msg.type === 'ready') {
            setIsConnecting(false);
            setIsConnected(true);
            isSetupCompleteRef.current = true;
            retryCountRef.current = 0;
            startHeartbeat();

            // Immediately ensure any pending document context updates are synchronized
            if (pendingContextRef.current && pendingContextRef.current !== filesRef.current) {
              ws.send(JSON.stringify({
                type: 'updateContext',
                files: pendingContextRef.current,
              }));
            }

            // Connect microphone processor node
            if (stream && inputCtx) {
              const source = inputCtx.createMediaStreamSource(stream);
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              source.connect(processor);
              processor.connect(inputCtx.destination);

              processor.onaudioprocess = (e) => {
                if (isMutedRef.current) return;
                const channelData = e.inputBuffer.getChannelData(0);
                const base64 = pcmToBase64(channelData);
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ audio: base64 }));
                }
              };
              processorRef.current = processor;
            }
          }

          if (msg.interrupted) {
            stopAllAudio();
            onInterruptedRef.current?.();
          }

          if (msg.audio) {
            playAudioChunk(msg.audio);
          }

          if (msg.userText) {
            onUserSpeechRef.current?.(msg.userText);
          }

          if (msg.modelText) {
            onModelSpeechRef.current?.(msg.modelText);
          }

          if (msg.turnComplete || msg.generationComplete) {
            onTurnCompleteRef.current?.();
          }

          if (msg.error) {
            console.warn('Live API warning from server:', msg.error);
          }
        } catch (parseErr) {
          console.warn('Error parsing live WS message:', parseErr);
        }
      };

      const handleConnectionLoss = () => {
        clearHeartbeat();
        if (isExplicitDisconnectRef.current) {
          disconnect(true);
          return;
        }

        // Automatic retry with exponential backoff
        if (retryCountRef.current < MAX_RETRIES) {
          const nextRetry = retryCountRef.current + 1;
          retryCountRef.current = nextRetry;
          const delay = Math.min(1000 * Math.pow(1.5, nextRetry - 1), 6000);
          
          setIsConnecting(true);
          setIsConnected(false);
          isSetupCompleteRef.current = false;
          
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (!isExplicitDisconnectRef.current) {
              connect(true);
            }
          }, delay);
        } else {
          setError('Live voice connection lost. Please click Start Live Chat to reconnect.');
          disconnect(true);
        }
      };

      ws.onerror = (e) => {
        console.warn('Live WebSocket error:', e);
        handleConnectionLoss();
      };

      ws.onclose = () => {
        handleConnectionLoss();
      };
    } catch (err: any) {
      console.warn('Live connect error:', err);
      let errMsg = 'Failed to start live voice chat.';
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        errMsg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
        disconnect(true);
      } else if (err?.message) {
        errMsg = err.message;
      }
      setError(errMsg);
      if (!isExplicitDisconnectRef.current && retryCountRef.current < MAX_RETRIES) {
        const nextRetry = retryCountRef.current + 1;
        retryCountRef.current = nextRetry;
        const delay = Math.min(1000 * Math.pow(1.5, nextRetry - 1), 6000);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          if (!isExplicitDisconnectRef.current) {
            connect(true);
          }
        }, delay);
      } else {
        disconnect(true);
      }
    }
  }, [isConnected, isConnecting, disconnect]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
    }
  }, []);

  const updateDocumentContext = useCallback((newFiles: LocalFile[]) => {
    pendingContextRef.current = newFiles;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'updateContext', files: newFiles }));
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect(true);
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    error,
    connect: () => connect(false),
    disconnect: () => disconnect(true),
    toggleMute,
    sendTextMessage,
    updateDocumentContext,
    clearError,
  };
}
