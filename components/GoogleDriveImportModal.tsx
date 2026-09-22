/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Folder, FileText, Download, Loader2, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { LocalFile } from '../types';

interface GoogleDriveImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFiles: (files: LocalFile[]) => void;
}

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

// Initialize Firebase App for Auth
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.file');

export const GoogleDriveImportModal: React.FC<GoogleDriveImportModalProps> = ({
  isOpen,
  onClose,
  onImportFiles,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
    }
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    setIsLoadingAuth(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Failed to obtain Google OAuth access token.");
      }
      setUser(result.user);
      setAccessToken(credential.accessToken);
      await fetchDriveFiles(credential.accessToken);
    } catch (err: any) {
      console.warn("Google Drive sign-in error:", err);
      setError(err?.message || "Failed to authenticate with Google Drive.");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const fetchDriveFiles = async (token: string) => {
    setIsLoadingFiles(true);
    setError(null);
    try {
      const query = encodeURIComponent("mimeType != 'application/vnd.google-apps.folder' and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=100&q=${query}&fields=files(id,name,mimeType,webViewLink)`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Drive API error (status ${res.status})`);
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.warn("Error fetching Drive files:", err);
      setError(err?.message || "Failed to list Google Drive files.");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const toggleSelectFile = (id: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedFileIds(next);
  };

  const handleImportSelected = async () => {
    if (!accessToken || selectedFileIds.size === 0) return;

    setIsImporting(true);
    setError(null);

    const importedFiles: LocalFile[] = [];

    try {
      for (const fileId of selectedFileIds) {
        const fileMeta = files.find(f => f.id === fileId);
        if (!fileMeta) continue;

        let content = '';
        const mime = fileMeta.mimeType;

        if (mime === 'application/vnd.google-apps.document') {
          // Export Google Doc as plain text
          const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (exportRes.ok) {
            content = await exportRes.text();
          }
        } else if (mime === 'application/vnd.google-apps.spreadsheet') {
          // Export Google Sheet as CSV
          const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (exportRes.ok) {
            content = await exportRes.text();
          }
        } else {
          // Download binary / text file content
          const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (downloadRes.ok) {
            content = await downloadRes.text();
          }
        }

        if (content) {
          let fileName = fileMeta.name;
          if (mime === 'application/vnd.google-apps.document' && !fileName.endsWith('.txt')) {
            fileName += '.txt';
          } else if (mime === 'application/vnd.google-apps.spreadsheet' && !fileName.endsWith('.csv')) {
            fileName += '.csv';
          }

          importedFiles.push({
            name: fileName,
            content: content,
          });
        }
      }

      if (importedFiles.length > 0) {
        onImportFiles(importedFiles);
        onClose();
      } else {
        setError("Could not retrieve content from selected files.");
      }
    } catch (err: any) {
      console.warn("Import error:", err);
      setError(err?.message || "Failed to download file contents from Google Drive.");
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1E1E1E] border border-white/10 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative text-[#E2E2E2] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#4285F4]/20 text-[#4285F4] flex items-center justify-center border border-[#4285F4]/30">
              <Folder size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import from Google Drive</h2>
              <p className="text-xs text-[#A8ABB4]">Select documents from your Google Drive to add to your knowledge base</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A8ABB4] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        {!user || !accessToken ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.06] flex items-center justify-center text-[#79B8FF] mb-2">
              <Folder size={32} />
            </div>
            <h3 className="text-base font-semibold text-white">Connect Your Google Account</h3>
            <p className="text-xs text-[#A8ABB4] max-w-md">
              Sign in with your Google account to browse your Drive files and import them directly into this RAG knowledge base.
            </p>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg max-w-md">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Official Google Sign-In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoadingAuth}
              className="gsi-material-button mt-4 inline-flex items-center gap-3 px-6 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-gray-100 transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isLoadingAuth ? (
                <Loader2 size={18} className="animate-spin text-black" />
              ) : (
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>Sign in with Google</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col flex-grow min-h-0 gap-4">
            {/* Search & Status Bar */}
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Search Drive files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-grow px-3 py-2 bg-[#2C2C2C] border border-white/10 rounded-lg text-xs text-white placeholder-[#777777] focus:outline-none focus:border-[#79B8FF]"
              />
              <span className="text-xs text-[#A8ABB4] shrink-0">
                {selectedFileIds.size} selected
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* File List */}
            <div className="flex-grow overflow-y-auto border border-white/10 rounded-lg bg-[#141414] p-2 min-h-[240px] max-h-[350px]">
              {isLoadingFiles ? (
                <div className="h-full flex flex-col items-center justify-center py-12 gap-2 text-[#A8ABB4]">
                  <Loader2 size={24} className="animate-spin text-[#79B8FF]" />
                  <span className="text-xs">Loading files from Google Drive...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="h-full flex items-center justify-center py-12 text-xs text-[#A8ABB4]">
                  No matching files found in your Google Drive.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredFiles.map((file) => {
                    const isSelected = selectedFileIds.has(file.id);
                    return (
                      <div
                        key={file.id}
                        onClick={() => toggleSelectFile(file.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-[#79B8FF]/15 border border-[#79B8FF]/30 text-white' 
                            : 'hover:bg-white/5 text-[#D1D5DB] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className={isSelected ? 'text-[#79B8FF]' : 'text-[#A8ABB4]'} />
                          <span className="text-xs font-medium truncate" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-[#A8ABB4] uppercase">
                            {file.mimeType.includes('document') ? 'Google Doc' : file.mimeType.includes('spreadsheet') ? 'Google Sheet' : 'File'}
                          </span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="accent-[#79B8FF] cursor-pointer"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <span className="text-xs text-[#A8ABB4]">
                Signed in as <span className="text-white font-medium">{user.email}</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#A8ABB4] hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSelected}
                  disabled={selectedFileIds.size === 0 || isImporting}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-black bg-[#79B8FF] hover:bg-[#68a7ef] rounded-lg transition-all shadow-md disabled:opacity-40 cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Import Selected ({selectedFileIds.size})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
