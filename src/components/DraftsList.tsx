import React, { useState } from "react";
import { 
  FolderEdit, 
  Trash2, 
  BookOpen, 
  Calendar, 
  Layers, 
  FileText, 
  Image as ImageIcon,
  Search,
  AlertCircle
} from "lucide-react";
import { Draft } from "../types";
import { formatBytes } from "../utils";

interface DraftsListProps {
  drafts: Draft[];
  onResumeEdit: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
  onClearAll?: () => void;
}

export default function DraftsList({ 
  drafts, 
  onResumeEdit, 
  onDeleteDraft,
  onClearAll 
}: DraftsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);

  const filteredDrafts = drafts.filter(draft => {
    const titleMatch = draft.title.toLowerCase().includes(searchTerm.toLowerCase());
    const resourceMatch = draft.resources.some(res => 
      res.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return titleMatch || resourceMatch;
  });

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 font-sans">
      
      {/* Header section with refined enterprise copy */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 flex items-center gap-2">
            <FolderEdit className="text-slate-850" size={20} />
            <span>Repositorio de documentos digitalizados</span>
          </h1>
          <p className="text-slate-500 mt-1.5 text-xs leading-relaxed max-w-xl">
            Acceso local e historial de borradores generados por el motor de reconstrucción espacial.
          </p>
        </div>

        {drafts.length > 0 && onClearAll && (
          <button
            onClick={() => setIsConfirmingClearAll(true)}
            className="text-[11px] text-slate-500 hover:text-red-700 font-semibold border border-slate-200 hover:bg-slate-50 hover:border-red-200 px-3.5 py-1.5 rounded-lg transition-all self-start sm:self-center cursor-pointer"
          >
            Vaciar repositorio
          </button>
        )}
      </div>

      {/* Filter panel */}
      {drafts.length > 0 && (
        <div className="mb-6 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={14} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#fcfcfb] hover:bg-white text-xs border border-slate-250 rounded-lg pl-9 pr-4 py-2.5 outline-none transition-all placeholder-slate-400 text-slate-850 focus:border-slate-400"
            placeholder="Filtrar por título de documento o nombre de recurso de origen..."
          />
        </div>
      )}

      {/* Main layout lists/grid */}
      {filteredDrafts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredDrafts.map((draft) => {
            const wordCount = draft.blocks.reduce((acc, b) => {
              return acc + (b.content.split(/\s+/).filter(Boolean).length);
            }, 0);

            return (
              <div 
                key={draft.id} 
                className="bg-white border border-slate-200 hover:border-slate-800 rounded-xl p-5 shadow-3xs hover:shadow-2xs transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Thin neat dark topbar on hover */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-900 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div>
                  {/* Card Header title and block count */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <h3 className="font-bold text-slate-800 text-sm group-hover:text-slate-900 truncate min-w-0 flex-1 leading-tight">
                      {draft.title || "Documento sin título"}
                    </h3>
                    <div className="flex items-center gap-1 text-[9px] text-slate-450 bg-slate-100 rounded-md px-2 py-0.5 font-bold shrink-0 font-mono select-none">
                      <Layers size={9} />
                      <span>{draft.blocks.length} BLQ</span>
                    </div>
                  </div>

                  {/* Metadata line */}
                  <div className="flex items-center gap-2.5 text-[10px] text-slate-400 mb-3.5">
                    <span className="flex items-center gap-1 font-medium font-mono">
                      <Calendar size={10} />
                      <span>{new Date(draft.updatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</span>
                    </span>
                    <span className="w-1 h-1 bg-slate-200 rounded-full" />
                    <span className="font-medium font-mono">{wordCount} palabras</span>
                  </div>

                  {/* Content teaser preview */}
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-4.5 italic bg-slate-50/70 p-2 rounded border border-slate-100">
                    {draft.blocks.find(b => b.content.trim())?.content.replace(/<[^>]+>/g, '') || "Borrador de documento vacío"}
                  </p>

                  {/* Attached original files list */}
                  <div className="mb-4">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                      Recursos vinculados ({draft.resources.length})
                    </span>
                    {draft.resources.length > 0 ? (
                      <div className="space-y-1">
                        {draft.resources.map((res, rIdx) => {
                          const isPdf = res.type === "application/pdf";
                          return (
                            <div key={rIdx} className="flex items-center justify-between text-[11px] bg-slate-50/55 border border-slate-150 p-1.5 rounded">
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <div className={`p-0.5 rounded shrink-0 ${isPdf ? 'text-slate-600' : 'text-slate-600'}`}>
                                  {isPdf ? <FileText size={11} /> : <ImageIcon size={11} />}
                                </div>
                                <span className="font-medium truncate text-slate-700 text-[10.5px]">{res.name}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 shrink-0 font-mono font-semibold">{formatBytes(res.size)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic bg-slate-50/50 p-1.5 rounded border border-slate-100">
                        No existen anexos cargados para este documento.
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between shrink-0">
                  <button
                    onClick={() => setDraftToDelete(draft.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Eliminar borrador definitivamente"
                  >
                    <div className="flex items-center gap-1 text-[11px] font-semibold">
                      <Trash2 size={12} />
                      <span className="hidden sm:inline">Descartar</span>
                    </div>
                  </button>

                  <button
                    onClick={() => onResumeEdit(draft)}
                    className="bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-3xs"
                  >
                    <BookOpen size={12} className="text-slate-550" />
                    <span>Abrir en Editor</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State Graphic */
        <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-14 text-center mt-4">
          <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3.5 text-slate-400">
            <FolderEdit size={20} />
          </div>
          <h3 className="text-xs font-bold text-slate-800 mb-1">
            {searchTerm ? "No se encontraron borradores coincidentes" : "El repositorio de borradores está vacío"}
          </h3>
          <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto leading-relaxed">
            {searchTerm 
              ? "Prueba ingresando otra palabra clave." 
              : "Sube un archivo original y ejecuta la conversión para almacenar un nuevo documento."}
          </p>
        </div>
      )}

      {/* Delete Draft Modal */}
      {draftToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-3xs">
          <div className="bg-white rounded-lg border border-slate-200 p-5.5 max-w-xs w-full mx-4 shadow-lg animate-fade-in">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Confirmar Eliminación</h4>
            <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">
              Esta operación descartará permanentemente el documento y su estructura jerárquica del almacenamiento local.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDraftToDelete(null)}
                className="px-3 py-1.5 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-semibold cursor-pointer border border-slate-250 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDeleteDraft(draftToDelete);
                  setDraftToDelete(null);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Historical Modal */}
      {isConfirmingClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-3xs">
          <div className="bg-white rounded-lg border border-slate-200 p-5.5 max-w-xs w-full mx-4 shadow-lg animate-fade-in">
            <h4 className="font-bold text-red-650 text-xs uppercase tracking-wider mb-2">Confirmar Vaciado</h4>
            <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">
              Esto eliminará de forma irreversible el historial completo de documentos digitalizados.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsConfirmingClearAll(false)}
                className="px-3 py-1.5 hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-semibold cursor-pointer border border-slate-250 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (onClearAll) onClearAll();
                  setIsConfirmingClearAll(false);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Vaciar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
