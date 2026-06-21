import React from "react";
import { 
  FileUp, 
  FolderEdit, 
  BookOpen, 
  Settings,
  Shield
} from "lucide-react";

interface SidebarProps {
  activeTab: 'upload' | 'drafts' | 'editor';
  setActiveTab: (tab: 'upload' | 'drafts' | 'editor') => void;
  draftsCount: number;
  hasActiveDocument: boolean;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  draftsCount, 
  hasActiveDocument
}: SidebarProps) {
  return (
    <aside 
      id="notion-sidebar"
      className="w-64 bg-[#fcfcfb] border-r border-[#efefe1] flex flex-col h-screen text-slate-850 select-none font-sans shrink-0"
    >
      {/* Workspace Header - Corporate styled */}
      <div className="p-4 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100">
        <div className="w-6.5 h-6.5 rounded bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-xs">
          R
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-xs tracking-wider text-slate-800 uppercase leading-none">Reconstructor documental</span>
        </div>
      </div>

      {/* Navigation options */}
      <div className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-400 px-2.5 mb-2.5 uppercase tracking-wider">
          Módulos de trabajo
        </div>

        {/* Scan & Upload Option */}
        <button
          id="nav-upload-btn"
          onClick={() => setActiveTab('upload')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer ${
            activeTab === 'upload' 
              ? 'bg-[#efefe1] text-slate-900 shadow-3xs' 
              : 'text-slate-500 hover:bg-[#efefe1]/40 hover:text-slate-800'
          }`}
        >
          <FileUp size={14} className={activeTab === 'upload' ? 'text-slate-900' : 'text-slate-400'} />
          <span>Conversión de documentos</span>
        </button>

        {/* Drafts portfolio Option */}
        <button
          id="nav-drafts-btn"
          onClick={() => setActiveTab('drafts')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer ${
            activeTab === 'drafts' 
              ? 'bg-[#efefe1] text-slate-900 shadow-3xs' 
              : 'text-slate-500 hover:bg-[#efefe1]/40 hover:text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FolderEdit size={14} className={activeTab === 'drafts' ? 'text-slate-900' : 'text-slate-400'} />
            <span>Historial de borradores</span>
          </div>
          {draftsCount > 0 && (
            <span className="bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono">
              {draftsCount}
            </span>
          )}
        </button>

        {/* Active workspace editor Option */}
        {hasActiveDocument && (
          <button
            id="nav-editor-btn"
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer ${
              activeTab === 'editor' 
                ? 'bg-[#efefe1] text-slate-900 shadow-3xs' 
                : 'text-slate-500 hover:bg-[#efefe1]/40 hover:text-slate-800'
          }`}
          >
            <BookOpen size={14} className={activeTab === 'editor' ? 'text-slate-900' : 'text-slate-400'} />
            <span className="truncate">Editor de estructura</span>
            <div className="ml-auto w-1 h-1 bg-slate-900 rounded-full animate-ping" />
          </button>
        )}

        {/* Formats specification section */}
        <div className="pt-5 border-t border-slate-100 mt-5" />

        <div className="text-[10px] font-bold text-slate-400 px-2.5 py-1 mb-1.5 uppercase tracking-wider">
          Capacidades técnicas
        </div>
        <div className="space-y-2 px-3 py-1.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 bg-slate-400 rounded-full shrink-0" />
            <span>Muestreo espacial multijerarquía</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 bg-slate-400 rounded-full shrink-0" />
            <span>Reconstrucción nativa de tablas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 bg-slate-400 rounded-full shrink-0" />
            <span>Soporte de PDFs e imágenes RAW</span>
          </div>
        </div>
      </div>

      {/* Footer secure processing */}
      <div className="p-3 border-t border-slate-100 flex items-center justify-between text-[11px] bg-[#fcfcfb] text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-450 rounded-full border border-slate-300" />
          <span className="font-semibold text-[10px] text-slate-400 tracking-wide uppercase">Cifrado de extremo a extremo</span>
        </div>
      </div>
    </aside>
  );
}
