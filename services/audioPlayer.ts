/**
 * Audio playback helper for Gemini TTS and Web Audio PCM streams.
 */

let currentAudio: HTMLAudioElement | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentAudioCtx: AudioContext | null = null;

export const stopCurrentAudio = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch (e) {}
    currentSourceNode = null;
  }
  if (currentAudioCtx && currentAudioCtx.state !== 'closed') {
    try {
      currentAudioCtx.close().catch(() => {});
    } catch (e) {}
    currentAudioCtx = null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

export const playGeminiAudio = async (base64Data: string, mimeType = 'audio/mp3'): Promise<void> => {
  stopCurrentAudio();

  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
      currentAudio = audio;

      audio.onended = () => {
        currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        // Fallback to PCM audio decoding if HTML5 Audio fails
        playPcmAudio(base64Data).then(resolve).catch(reject);
      };

      audio.play().catch(() => {
        playPcmAudio(base64Data).then(resolve).catch(reject);
      });
    } catch (err) {
      playPcmAudio(base64Data).then(resolve).catch(reject);
    }
  });
};

export const playPcmAudio = async (base64Pcm: string, sampleRate = 24000): Promise<void> => {
  stopCurrentAudio();

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) throw new Error("AudioContext not supported");

  const ctx = new AudioCtxClass({ sampleRate });
  currentAudioCtx = ctx;

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  try {
    const binary = atob(base64Pcm);
    const f32 = new Float32Array(binary.length / 2);
    for (let i = 0; i < f32.length; i++) {
      const int = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      const signed = int >= 32768 ? int - 65536 : int;
      f32[i] = signed / 32768;
    }

    const buffer = ctx.createBuffer(1, f32.length, sampleRate);
    buffer.getChannelData(0).set(f32);

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      currentSourceNode = source;
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        currentSourceNode = null;
        ctx.close().catch(() => {});
        resolve();
      };
      source.start();
    });
  } catch (err) {
    ctx.close().catch(() => {});
    throw err;
  }
};
