/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UrlContextMetadataItem, DocumentCitation, LocalFile, ChatMessage } from '../types';

interface GeminiResponse {
  text: string;
  urlContextMetadata?: UrlContextMetadataItem[];
  citations?: DocumentCitation[];
}

async function safeFetchJson(url: string, payload: any): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error (status ${response.status})`);
    }
    const errorText = await response.text().catch(() => "");
    throw new Error(`Server returned error ${response.status}: ${errorText.substring(0, 100) || "Service temporarily unavailable"}`);
  }

  if (contentType.includes("application/json")) {
    return await response.json();
  }

  // Fallback if server returned text
  const textContent = await response.text().catch(() => "");
  try {
    return JSON.parse(textContent);
  } catch (e) {
    throw new Error(`Invalid response from server. Please try again.`);
  }
}

export const generateContentWithUrlContext = async (
  prompt: string,
  files: LocalFile[],
  systemPersona?: string,
  chatHistory?: ChatMessage[],
  userPersona?: string
): Promise<GeminiResponse> => {
  const data = await safeFetchJson("/api/gemini/generate", { prompt, files, systemPersona, chatHistory, userPersona });
  return { 
    text: data.text, 
    citations: data.citations || [], 
    urlContextMetadata: data.urlContextMetadata || [] 
  };
};

export const getInitialSuggestions = async (files: LocalFile[]): Promise<GeminiResponse> => {
  if (files.length === 0) {
    return { text: JSON.stringify({ suggestions: ["Add some files to get topic suggestions."] }) };
  }
  
  const data = await safeFetchJson("/api/gemini/suggestions", { files });
  return { text: data.text };
};

export const generateTts = async (text: string, voice = 'Aoede'): Promise<{ audio: string; mimeType: string }> => {
  const data = await safeFetchJson("/api/gemini/tts", { text, voice });
  return { audio: data.audio, mimeType: data.mimeType || 'audio/mp3' };
};
