/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export enum MessageSender {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
}

export interface UrlContextMetadataItem {
  retrievedUrl: string;
  urlRetrievalStatus: string;
  title?: string;
  snippet?: string;
}

export interface DocumentCitation {
  id: number;
  fileName: string;
  snippet: string;
  title?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  timestamp: Date;
  isLoading?: boolean;
  urlContext?: UrlContextMetadataItem[];
  citations?: DocumentCitation[];
}

export interface LocalFile {
  name: string;
  content: string;
  inFocus?: boolean;
}

export interface FileGroup {
  id: string;
  name: string;
  files: LocalFile[];
}

export type GeminiVoiceName = 'Aoede' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface AppSettings {
  voiceName: GeminiVoiceName;
  systemPersona: string;
  autoPlayTts: boolean;
}
