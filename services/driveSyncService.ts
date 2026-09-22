/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, MessageSender } from '../types';

const FOLDER_NAME = "Mythos DMS Archives";

/**
 * Ensures a dedicated folder exists in Google Drive and returns its ID.
 */
export async function getOrCreateDriveFolder(token: string): Promise<string> {
  // Search for folder
  const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to create folder "${FOLDER_NAME}" in Google Drive.`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

/**
 * Pushes chat history logs to the designated "Mythos DMS Archives" folder in Google Drive.
 */
export async function syncChatHistoryToDrive(
  token: string,
  chatMessages: ChatMessage[],
  systemPersona?: string
): Promise<string> {
  if (!token || !chatMessages || chatMessages.length === 0) {
    throw new Error("No access token or chat messages provided for sync.");
  }

  const folderId = await getOrCreateDriveFolder(token);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `mythos-auto-archive-${timestamp}.md`;

  const header = `# Mythos DMS Reader - Automated Chat Archive\nSynced At: ${new Date().toLocaleString()}\nSystem Persona: ${systemPersona || 'Default'}\n\n---\n\n`;
  const messagesContent = chatMessages.map(msg => {
    const sender = msg.sender === MessageSender.USER ? 'User' : (msg.sender === MessageSender.MODEL ? 'Assistant (AI Persona)' : 'System');
    const time = new Date(msg.timestamp).toLocaleString();
    return `### [${time}] ${sender}\n\n${msg.text}\n`;
  }).join('\n---\n\n');

  const fileContent = header + messagesContent;

  const metadata = {
    name: fileName,
    mimeType: 'text/markdown',
    parents: [folderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileContent], { type: 'text/markdown' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Automated Google Drive sync failed (status ${res.status})`);
  }

  const fileData = await res.json();
  return fileData.id || fileName;
}
