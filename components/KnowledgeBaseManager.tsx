/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState } from 'react';
import { Upload, Trash2, ChevronDown, X, Edit2, Check, AlertCircle, FileText, RefreshCw, SkipForward, Loader2, Folder, Search } from 'lucide-react';
import { FileGroup, LocalFile } from '../types';
import { GoogleDriveImportModal } from './GoogleDriveImportModal';

interface KnowledgeBaseManagerProps {
  files: LocalFile[];
  onAddFiles: (files: LocalFile[]) => void;
  onRemoveFile: (fileName: string) => void;
  fileGroups: FileGroup[];
  activeFileGroupId: string;
  onSetGroupId: (id: string) => void;
  onCloseSidebar?: () => void;
  onToggleFileFocus: (fileName: string) => void;
  onToggleAllFocus: (focus: boolean) => void;
  onRenameGroup?: (id: string, newName: string) => void;
}

interface DuplicateConflict {
  file: File;
  content: string;
}

const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({ 
  files, 
  onAddFiles, 
  onRemoveFile, 
  fileGroups,
  activeFileGroupId,
  onSetGroupId,
  onCloseSidebar,
  onToggleFileFocus,
  onToggleAllFocus,
  onRenameGroup,
}) => {
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicateConflict[]>([]);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState(0);
  const [stagedFiles, setStagedFiles] = useState<LocalFile[]>([]);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readSingleFile = async (file: File): Promise<string> => {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      return fullText;
    } else {
      return await file.text();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsProcessingUpload(true);
    setError(null);

    const nonDuplicates: LocalFile[] = [];
    const duplicates: DuplicateConflict[] = [];
    const readErrors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const content = await readSingleFile(file);
        const isDuplicate = files.some(f => f.name === file.name);
        if (isDuplicate) {
          duplicates.push({ file, content });
        } else {
          nonDuplicates.push({ name: file.name, content });
        }
      } catch (err: any) {
        console.warn(`Could not read file "${file.name}":`, err?.message || err);
        readErrors.push(file.name);
      }
    }

    if (readErrors.length > 0) {
      setError(`Could not read ${readErrors.length} file(s): ${readErrors.join(', ')}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsProcessingUpload(false);

    if (duplicates.length === 0) {
      // No duplicates found, apply non-duplicates directly
      if (nonDuplicates.length > 0) {
        onAddFiles(nonDuplicates);
      }
    } else {
      // Duplicates detected: stage the non-duplicates and prompt user for duplicates in cue
      setStagedFiles(nonDuplicates);
      setDuplicateQueue(duplicates);
      setCurrentDuplicateIndex(0);
    }
  };

  const handleResolveDuplicate = (action: 'overwrite' | 'skip') => {
    const currentItem = duplicateQueue[currentDuplicateIndex];
    if (!currentItem) return;

    let nextStaged = [...stagedFiles];
    if (action === 'overwrite') {
      nextStaged.push({ name: currentItem.file.name, content: currentItem.content });
      setStagedFiles(nextStaged);
    }

    const nextIndex = currentDuplicateIndex + 1;
    if (nextIndex < duplicateQueue.length) {
      setCurrentDuplicateIndex(nextIndex);
    } else {
      // Reached the end of the duplicate cue
      if (nextStaged.length > 0) {
        onAddFiles(nextStaged);
      }
      setDuplicateQueue([]);
      setCurrentDuplicateIndex(0);
      setStagedFiles([]);
    }
  };

  const handleResolveAllRemaining = (action: 'overwrite' | 'skip') => {
    let nextStaged = [...stagedFiles];
    if (action === 'overwrite') {
      for (let i = currentDuplicateIndex; i < duplicateQueue.length; i++) {
        const item = duplicateQueue[i];
        nextStaged.push({ name: item.file.name, content: item.content });
      }
    }
    if (nextStaged.length > 0) {
      onAddFiles(nextStaged);
    }
    setDuplicateQueue([]);
    setCurrentDuplicateIndex(0);
    setStagedFiles([]);
  };

  const handleCancelDuplicateQueue = () => {
    // If user cancels the prompt, commit any already staged non-duplicates and close
    if (stagedFiles.length > 0) {
      onAddFiles(stagedFiles);
    }
    setDuplicateQueue([]);
    setCurrentDuplicateIndex(0);
    setStagedFiles([]);
  };

  const activeGroupName = fileGroups.find(g => g.id === activeFileGroupId)?.name || "Unknown Group";

  return (
    <div className="p-4 bg-[#1E1E1E] shadow-md rounded-xl h-full flex flex-col border border-[rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-[#E2E2E2]">Knowledge Base Files</h2>
        {onCloseSidebar && (
          <button
            onClick={onCloseSidebar}
            className="p-1 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
            aria-label="Close knowledge base"
          >
            <X size={24} />
          </button>
        )}
      </div>
      
      <div className="mb-3">
        <label htmlFor="file-group-select-kb" className="block text-sm font-medium text-[#A8ABB4] mb-1">
          Active File Group
        </label>
        {isEditingName ? (
           <div className="flex items-center gap-2 w-full">
             <input
               type="text"
               value={editedName}
               onChange={(e) => setEditedName(e.target.value)}
               className="flex-grow py-2 px-3 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] rounded-md focus:ring-1 focus:ring-white/20 focus:outline-none text-sm"
               autoFocus
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   if (onRenameGroup && editedName.trim()) {
                     onRenameGroup(activeFileGroupId, editedName.trim());
                   }
                   setIsEditingName(false);
                 } else if (e.key === 'Escape') {
                   setIsEditingName(false);
                 }
               }}
             />
             <button
               onClick={() => {
                 if (onRenameGroup && editedName.trim()) {
                   onRenameGroup(activeFileGroupId, editedName.trim());
                 }
                 setIsEditingName(false);
               }}
               className="p-2 text-[#79B8FF] hover:bg-white/10 rounded-md transition-colors"
               title="Save"
             >
               <Check size={16} />
             </button>
             <button
               onClick={() => setIsEditingName(false)}
               className="p-2 text-[#A8ABB4] hover:bg-white/10 rounded-md transition-colors"
               title="Cancel"
             >
               <X size={16} />
             </button>
           </div>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-grow">
              <select
                id="file-group-select-kb"
                value={activeFileGroupId}
                onChange={(e) => {
                  onSetGroupId(e.target.value);
                  setIsEditingName(false);
                }}
                className="w-full py-2 pl-3 pr-8 appearance-none border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] rounded-md focus:ring-1 focus:ring-white/20 focus:border-white/20 text-sm"
              >
                {fileGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A8ABB4] pointer-events-none"
                aria-hidden="true"
              />
            </div>
            {onRenameGroup && (
              <button
                onClick={() => {
                  setEditedName(fileGroups.find(g => g.id === activeFileGroupId)?.name || "");
                  setIsEditingName(true);
                }}
                className="p-2 text-[#A8ABB4] hover:text-[#E2E2E2] hover:bg-white/10 rounded-md transition-colors flex-shrink-0"
                title="Rename group"
                aria-label="Rename active group"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <input
          type="file"
          accept=".txt,.md,.pdf"
          multiple
          ref={fileInputRef}
          onChange={handleFileUpload}
          disabled={isProcessingUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className={`cursor-pointer flex items-center justify-center gap-2 h-10 px-4 border border-dashed border-[rgba(255,255,255,0.3)] bg-[#2C2C2C] hover:bg-white/10 text-[#E2E2E2] rounded-lg transition-colors text-sm w-full ${isProcessingUpload ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {isProcessingUpload ? (
            <>
              <Loader2 size={16} className="animate-spin text-[#79B8FF]" />
              <span>Processing Files...</span>
            </>
          ) : (
            <>
              <Upload size={16} />
              <span>Upload Files</span>
            </>
          )}
        </label>

        {/* Google Drive Import Button */}
        <button
          onClick={() => setIsDriveModalOpen(true)}
          className="flex items-center justify-center gap-2 h-10 px-4 bg-[#4285F4]/15 hover:bg-[#4285F4]/25 border border-[#4285F4]/30 text-[#8AB4F8] rounded-lg transition-colors text-sm w-full cursor-pointer font-medium"
        >
          <Folder size={16} className="text-[#4285F4]" />
          <span>Import from Google Drive</span>
        </button>
      </div>
      {error && <p className="text-xs text-[#f87171] mb-2">{error}</p>}

      {/* Google Drive Import Modal */}
      <GoogleDriveImportModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportFiles={(newFiles) => {
          onAddFiles(newFiles);
        }}
      />
      
      {files.length > 0 && (
        <>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888]" size={14} />
            <input
              type="text"
              placeholder="Search documents by name..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.08)] rounded-md text-xs text-[#E2E2E2] placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-between mb-2 px-2 py-1 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] rounded-md">
            <label className="flex items-center gap-2 text-sm text-[#E2E2E2] cursor-pointer">
              <input 
                type="checkbox" 
                checked={files.every(f => f.inFocus !== false)} 
                ref={input => { 
                  if (input) {
                    const allFocused = files.every(f => f.inFocus !== false);
                    const someFocused = files.some(f => f.inFocus !== false) && !allFocused;
                    input.indeterminate = someFocused;
                  }
                }} 
                onChange={(e) => onToggleAllFocus(e.target.checked)} 
                className="accent-[#79B8FF] cursor-pointer" 
              />
              <span className="text-xs font-medium">Select All</span>
            </label>
            <span className="text-xs text-[#A8ABB4]">{files.filter(f => f.inFocus !== false).length} / {files.length} in focus</span>
          </div>
        </>
      )}

      <div className="flex-grow overflow-y-auto space-y-2 chat-container">
        {files
          .filter(f => f.name.toLowerCase().includes(docSearchQuery.toLowerCase()))
          .map((file) => (
          <div key={file.name} className={`flex items-center justify-between p-2.5 bg-[#2C2C2C] border ${file.inFocus !== false ? 'border-[rgba(255,255,255,0.15)]' : 'border-[rgba(255,255,255,0.02)] opacity-70'} rounded-lg hover:shadow-sm transition-all`}>
            <label className="flex items-center gap-2 cursor-pointer flex-grow overflow-hidden">
              <input 
                type="checkbox" 
                checked={file.inFocus !== false} 
                onChange={() => onToggleFileFocus(file.name)} 
                className="accent-[#79B8FF] flex-shrink-0 cursor-pointer" 
              />
              <span className={`text-xs truncate ${file.inFocus !== false ? 'text-[#E2E2E2]' : 'text-[#A8ABB4]'}`} title={file.name}>
                {file.name}
              </span>
            </label>
            <button 
              onClick={() => onRemoveFile(file.name)}
              className="p-1 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex-shrink-0 ml-2"
              aria-label={`Remove ${file.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Duplicate file resolution modal */}
      {duplicateQueue.length > 0 && currentDuplicateIndex < duplicateQueue.length && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div 
            className="bg-[#1E1E1E] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-dialog-title"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-full bg-amber-500/15 text-amber-400 shrink-0">
                <AlertCircle size={22} />
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="duplicate-dialog-title" className="text-sm font-semibold text-[#E2E2E2]">
                    Duplicate File Detected
                  </h3>
                  {duplicateQueue.length > 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-[#A8ABB4] font-medium shrink-0">
                      File {currentDuplicateIndex + 1} of {duplicateQueue.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A8ABB4] mt-1">
                  A file with this name already exists in the active group.
                </p>
              </div>
            </div>

            <div className="bg-[#262626] border border-white/5 rounded-lg p-3 mb-4 flex items-center gap-2.5">
              <FileText size={18} className="text-[#79B8FF] shrink-0" />
              <span className="text-xs font-mono font-medium text-white truncate" title={duplicateQueue[currentDuplicateIndex].file.name}>
                {duplicateQueue[currentDuplicateIndex].file.name}
              </span>
            </div>

            <p className="text-xs text-[#C5C5C5] mb-4 leading-relaxed">
              Would you like to <span className="text-white font-medium">overwrite</span> the existing file with the new content, or <span className="text-white font-medium">skip</span> this file and continue to the next?
            </p>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleResolveDuplicate('skip')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-[#E2E2E2] font-medium transition-colors cursor-pointer"
                >
                  <SkipForward size={14} />
                  <span>Skip File</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveDuplicate('overwrite')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs bg-[#79B8FF] hover:bg-[#79B8FF]/90 text-[#121212] font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  <RefreshCw size={14} />
                  <span>Overwrite File</span>
                </button>
              </div>

              {duplicateQueue.length - currentDuplicateIndex > 1 && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 mt-1">
                  <button
                    type="button"
                    onClick={() => handleResolveAllRemaining('skip')}
                    className="py-1.5 px-2 rounded-md text-xs text-[#A8ABB4] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Skip All Remaining ({duplicateQueue.length - currentDuplicateIndex})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveAllRemaining('overwrite')}
                    className="py-1.5 px-2 rounded-md text-xs text-[#79B8FF] hover:bg-[#79B8FF]/10 transition-colors cursor-pointer"
                  >
                    Overwrite All ({duplicateQueue.length - currentDuplicateIndex})
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancelDuplicateQueue}
                  className="text-xs text-[#777777] hover:text-[#A8ABB4] transition-colors cursor-pointer"
                >
                  Cancel remaining
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseManager;
