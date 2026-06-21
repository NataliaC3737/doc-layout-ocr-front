import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Uploader from "./components/Uploader";
import Editor from "./components/Editor";
import DraftsList from "./components/DraftsList";
import { Draft, Block, ResourceFile } from "./types";
import { 
  getLocalDrafts, 
  saveLocalDrafts, 
  parseHtmlToBlocks,
  getDbDrafts,
  saveDbDraft,
  deleteDbDraft,
  clearDbDrafts
} from "./utils";
import { Sparkles, FileText, FolderPlus, HelpCircle } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'drafts' | 'editor'>('upload');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  
  // Active document workspace under edit
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [activeBlocks, setActiveBlocks] = useState<Block[]>([]);
  const [activeResources, setActiveResources] = useState<ResourceFile[]>([]);
  const [activeModelUsed, setActiveModelUsed] = useState("");

  // Load saved drafts on app startup from IndexedDB first (with localStorage as fallback)
  useEffect(() => {
    getDbDrafts().then(loaded => {
      if (loaded && loaded.length > 0) {
        setDrafts(loaded);
      } else {
        const local = getLocalDrafts();
        setDrafts(local);
      }
    }).catch(err => {
      console.warn("Could not load from IndexedDB, using localStorage:", err);
      setDrafts(getLocalDrafts());
    });
  }, []);

  // Update drafts in IndexedDB & localStorage whenever the tab list changes
  const updateDraftsList = async (newDrafts: Draft[]) => {
    setDrafts(newDrafts);
    
    // Save to IndexedDB (asynchronous, so images won't block render)
    // Save each draft to IndexedDB to persist large documents (e.g., base64 attachments) safely
    for (const d of newDrafts) {
      try {
        await saveDbDraft(d);
      } catch (err) {
        console.error("Failed to save draft to IndexedDB:", err);
      }
    }
    
    // Save to localStorage as a fallback. We catch and ignore any full-quota errors
    try {
      saveLocalDrafts(newDrafts);
    } catch (err) {
      // Ignore quota warnings
    }
  };

  /**
   * OCR Callback: Triggered once Gemini successfully analyzes the layout & files
   */
  const handleOcrComplete = (html: string, processedFiles: ResourceFile[], cvRegions?: any[], modelUsed?: string) => {
    const resolvedModelName = modelUsed || "gemini-3.5-flash";
    
    // 1. Parsed blocks from OCR output HTML with mapped image assets and Computer Vision regions
    const parsedBlocks = parseHtmlToBlocks(html, processedFiles, cvRegions);
    
    // 2. Extrapolate initial title
    const docName = processedFiles[0]?.name 
      ? processedFiles[0].name.replace(/\.[^/.]+$/, "") 
      : `Documento - ${new Date().toLocaleDateString()}`;

    // 3. Setup active state values
    const newId = crypto.randomUUID();
    setActiveId(newId);
    setActiveTitle(docName);
    setActiveBlocks(parsedBlocks);
    setActiveResources(processedFiles);
    setActiveModelUsed(resolvedModelName);

    // 4. Automatically save this initial digitalized layout to Borradores
    const newDraft: Draft = {
      id: newId,
      title: docName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: parsedBlocks,
      resources: processedFiles,
      modelUsed: resolvedModelName
    };
    
    updateDraftsList([newDraft, ...drafts]);

    // 5. Instantly jump directly onto our newly minted Notion editor tab!
    setActiveTab('editor');
  };

  /**
   * Save / Sync active layout additions back to Borradores folder
   */
  const handleSaveActiveDraft = (title: string, blocks: Block[]) => {
    const now = new Date().toISOString();
    
    let updated: Draft[];
    if (activeId) {
      // Update existing draft
      updated = drafts.map(item => {
        if (item.id === activeId) {
          return {
            ...item,
            title,
            blocks,
            updatedAt: now
          };
        }
        return item;
      });
      
      // Update local state views so it displays synchronized edits properly
      setActiveTitle(title);
      setActiveBlocks(blocks);
    } else {
      // Create new draft
      const newId = crypto.randomUUID();
      const newD: Draft = {
        id: newId,
        title,
        createdAt: now,
        updatedAt: now,
        blocks,
        resources: activeResources
      };
      updated = [newD, ...drafts];
      setActiveId(newId);
    }

    updateDraftsList(updated);
  };

  /**
   * Resume draft editing (loads draft variables & opens editor)
   */
  const handleResumeDraftEdit = (draft: Draft) => {
    setActiveId(draft.id);
    setActiveTitle(draft.title);
    setActiveBlocks(draft.blocks);
    setActiveResources(draft.resources);
    setActiveModelUsed(draft.modelUsed || "gemini-3.5-flash");
    setActiveTab('editor');
  };

  /**
   * Delete Draft permanently from catalogue folder
   */
  const handleDeleteDraft = async (id: string) => {
    const updated = drafts.filter(d => d.id !== id);
    await updateDraftsList(updated);
    try {
       await deleteDbDraft(id);
    } catch (err) {
       console.error("Failed to delete draft from IndexedDB:", err);
    }

    // If deleting the document we currently edit, reset the editor states
    if (activeId === id) {
      setActiveId(null);
      setActiveTitle("");
      setActiveBlocks([]);
      setActiveResources([]);
      setActiveModelUsed("");
      // Redirect to upload dashboard safely
      setActiveTab('upload');
    }
  };

  const handleClearAllDrafts = async () => {
    await updateDraftsList([]);
    try {
      await clearDbDrafts();
    } catch (err) {
      console.error("Failed to clear drafts from IndexedDB:", err);
    }
    setActiveId(null);
    setActiveTitle("");
    setActiveBlocks([]);
    setActiveResources([]);
    setActiveTab('upload');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">
      
      {/* Notion style workspace left sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        draftsCount={drafts.length}
        hasActiveDocument={activeBlocks.length > 0}
      />

      {/* Main viewport panels */}
      <main className="flex-1 h-screen overflow-hidden flex flex-col bg-white">
        
        {/* Upload Hub View */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-y-auto flex flex-col justify-between">
            <Uploader onOcrComplete={handleOcrComplete} />
            
            {/* Minimal Help panel banner */}
            <footer className="border-t border-slate-100 bg-[#fbfbfa]/50 py-4.5 px-8 shrink-0 select-none">
              <div className="max-w-2xl mx-auto flex items-center justify-center gap-2.5 text-[11px] text-slate-500">
                <HelpCircle size={14} className="text-slate-500 shrink-0" />
                <span>
                  Configure la cola de conversión, inicie el procesamiento y edite los resultados de manera interactiva. Use la tecla de acceso directo <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-[10px] text-slate-600">/</kbd> para insertar tablas, listas o citas lógicas.
                </span>
              </div>
            </footer>
          </div>
        )}

        {/* Saved Drafts Portfolio View */}
        {activeTab === 'drafts' && (
          <div className="flex-1 overflow-y-auto">
            <DraftsList 
              drafts={drafts} 
              onResumeEdit={handleResumeDraftEdit}
              onDeleteDraft={handleDeleteDraft}
              onClearAll={handleClearAllDrafts}
            />
          </div>
        )}

        {/* Notion HTML Block Editor Workspace View */}
        {activeTab === 'editor' && activeBlocks.length > 0 && (
          <Editor 
            key={activeId || "new"}
            initialTitle={activeTitle}
            initialBlocks={activeBlocks}
            onSaveDraft={handleSaveActiveDraft}
            onExit={() => setActiveTab('drafts')}
            scannedResources={activeResources}
            modelUsed={activeModelUsed}
          />
        )}
      </main>
    </div>
  );
}
