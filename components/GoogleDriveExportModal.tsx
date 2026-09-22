/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, CloudUpload, Loader2, Check, AlertCircle, FolderSync } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { ChatMessage, FileGroup } from '../types';
import { syncChatHistoryToDrive } from '../services/driveSyncService';

interface GoogleDriveExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatMessages: ChatMessage[];
  systemPersona?: string;
  fileGroups?: FileGroup[];
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

export const GoogleDriveExportModal: React.FC<GoogleDriveExportModalProps> = ({
  isOpen,
  onClose,
  chatMessages,
  systemPersona,
  fileGroups,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
    }
    setSuccessMessage(null);
    setError(null);
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
    } catch (err: any) {
      console.warn("Google Drive sign-in error:", err);
      setError(err?.message || "Failed to authenticate with Google Drive.");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleUploadToDrive = async () => {
    let token = accessToken;
    if (!token && user) {
      try {
        const credential = await user.getIdTokenResult();
      } catch (e) {}
    }

    if (!token) {
      await handleGoogleSignIn();
      return;
    }

    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const uploadedFileName = await syncChatHistoryToDrive(token, chatMessages, systemPersona);
      setSuccessMessage(`Successfully synced chat archive to "Mythos DMS Archives" folder as "${uploadedFileName}"!`);
    } catch (err: any) {
      console.warn("Google Drive automated sync error:", err);
      setError(err?.message || "Failed to sync chat history to Google Drive archive folder.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1E1E1E] border border-white/10 rounded-xl max-w-md w-full p-6 shadow-2xl relative text-[#E2E2E2] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#4285F4]/20 text-[#4285F4] flex items-center justify-center border border-[#4285F4]/30">
              <FolderSync size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Google Drive Archive Sync</h2>
              <p className="text-xs text-[#A8ABB4]">Automated sync to "Mythos DMS Archives" folder</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A8ABB4] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
              <Check size={15} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {!user ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-[#A8ABB4]">
                Sign in with Google to enable automated sync of your chat history and logs to the designated <span className="text-white font-medium">"Mythos DMS Archives"</span> folder in Google Drive.
              </p>
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoadingAuth}
                className="w-full inline-flex items-center justify-center gap-3 px-6 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-gray-100 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isLoadingAuth ? (
                  <Loader2 size={18} className="animate-spin text-black" />
                ) : (
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48 z" />
                  </svg>
                )}
                <span>Sign in with Google</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#141414] p-3 rounded-lg border border-white/10 text-xs space-y-1">
                <p className="text-white font-medium">Automated Archive Sync:</p>
                <p className="text-[#A8ABB4]">Account: <span className="text-white">{user.email}</span></p>
                <p className="text-[#A8ABB4]">Target Folder: <span className="text-[#79B8FF] font-medium">Mythos DMS Archives</span></p>
                <p className="text-[#A8ABB4]">Messages: <span className="text-white">{chatMessages.length} timestamped messages</span></p>
              </div>

              <button
                onClick={handleUploadToDrive}
                disabled={isExporting || chatMessages.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-black bg-[#79B8FF] hover:bg-[#68a7ef] rounded-lg transition-all shadow-md disabled:opacity-40 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-black" />
                    <span>Syncing to Drive Folder...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload size={16} />
                    <span>Sync Chat History to Google Drive</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#A8ABB4] hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
