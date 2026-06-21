import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  Settings, 
  Bold, 
  Italic, 
  Underline,
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  CheckSquare, 
  Quote, 
  Code, 
  Table as TableIcon,
  Image as ImageIcon,
  Save, 
  FileDown, 
  Printer,
  Sparkles,
  RefreshCw,
  PlusCircle,
  Undo,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FileText,
  GripVertical
} from "lucide-react";
import { Block, Draft, ResourceFile } from "../types";
import { exportBlocksToMarkdown, exportBlocksToHtml, downloadFile, exportToPrintableHtml } from "../utils";
// @ts-ignore
import html2pdf from "html2pdf.js";

interface EditorProps {
  key?: string;
  initialTitle: string;
  initialBlocks: Block[];
  onSaveDraft: (title: string, blocks: Block[]) => void;
  onExit: () => void;
  scannedResources?: ResourceFile[];
  modelUsed?: string;
}

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>((props, ref) => {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const combinedRef = (ref || localRef) as React.RefObject<HTMLTextAreaElement>;

  const adjustHeight = () => {
    const textarea = combinedRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [props.value]);

  useEffect(() => {
    // Initial adjust on mount with a microscopic delay to ensure container sizing is in place
    const timer = setTimeout(adjustHeight, 10);
    window.addEventListener("resize", adjustHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", adjustHeight);
    };
  }, []);

  const { value, onChange, ...rest } = props;

  return (
    <textarea
      ref={combinedRef}
      value={value}
      onChange={(e) => {
        // Adjust immediately upon user input
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
        if (onChange) {
          onChange(e);
        }
      }}
      {...rest}
      rows={rest.rows || 1}
      style={{
        ...rest.style,
        overflow: "hidden",
        overflowY: "hidden",
        resize: "none"
      }}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";

export default function Editor({ 
  initialTitle, 
  initialBlocks, 
  onSaveDraft, 
  onExit,
  scannedResources = [],
  modelUsed
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle || "Sin título");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [showSlashMenu, setShowSlashMenu] = useState<string | null>(null); // maps to block ID
  const [activeMenuBlockId, setActiveMenuBlockId] = useState<string | null>(null);
  const [slashSearch, setSlashSearch] = useState("");
  const [activeFormattingBlock, setActiveFormattingBlock] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [printPreviewMode, setPrintPreviewMode] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingPdfOutput, setIsGeneratingPdfOutput] = useState(false);
  const [selectedGalleryIdx, setSelectedGalleryIdx] = useState<number | null>(null);
  const [modalZoom, setModalZoom] = useState<number>(100);

  // Focus tracking for slash commands and block menus
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);

  // Close slash commands menu & block menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target as Node)) {
        setShowSlashMenu(null);
      }
      if (blockMenuRef.current && !blockMenuRef.current.contains(event.target as Node)) {
        setActiveMenuBlockId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape key handler to close image modal
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedGalleryIdx(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const triggerAutoSaveMarker = () => {
    setHasUnsavedChanges(true);
  };

  const updateBlockContent = (id: string, text: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === id) {
        // Detect slash trigger inline
        if (text.includes('/')) {
          const parts = text.split('/');
          const query = parts[parts.length - 1];
          setShowSlashMenu(id);
          setSlashSearch(query);
        } else {
          setShowSlashMenu(null);
        }
        return { ...block, content: text };
      }
      return block;
    }));
  };

  const updateBlockType = (id: string, type: Block['type']) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === id) {
        let cleanContent = block.content.replace('/', '');
        // Initialize default empty properties based on types
        const properties: any = { ...block.properties };
        
        if (type === 'todo' && properties.checked === undefined) {
          properties.checked = false;
        }
        if (type === 'code' && !properties.language) {
          properties.language = 'javascript';
        }
        if (type === 'table' && !properties.rows) {
          properties.rows = [
            ['Celda 1', 'Celda 2', 'Celda 3'],
            ['', '', ''],
            ['', '', '']
          ];
        }
        
        return { 
          ...block, 
          type, 
          content: cleanContent, 
          properties 
        };
      }
      return block;
    }));
    setShowSlashMenu(null);
  };

  // Checkbox toggle for todo block types
  const toggleTodoCheck = (id: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === id && block.type === 'todo') {
        const checked = !block.properties?.checked;
        return {
          ...block,
          properties: { ...block.properties, checked }
        };
      }
      return block;
    }));
  };

  // Interactive Table values update
  const updateTableCell = (blockId: string, rowIndex: number, colIndex: number, value: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId && block.type === 'table' && block.properties?.rows) {
        const updatedRows = block.properties.rows.map((row, rIdx) => {
          if (rIdx === rowIndex) {
            return row.map((cell, cIdx) => (cIdx === colIndex ? value : cell));
          }
          return row;
        });
        return {
          ...block,
          properties: { ...block.properties, rows: updatedRows }
        };
      }
      return block;
    }));
  };

  // Table Row Add
  const addTableRow = (blockId: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId && block.type === 'table' && block.properties?.rows) {
        const colCount = block.properties.rows[0]?.length || 2;
        const newRow = Array(colCount).fill('');
        return {
          ...block,
          properties: { 
            ...block.properties, 
            rows: [...block.properties.rows, newRow] 
          }
        };
      }
      return block;
    }));
  };

  // Table Column Add
  const addTableColumn = (blockId: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId && block.type === 'table' && block.properties?.rows) {
        const updatedRows = block.properties.rows.map(row => [...row, '']);
        return {
          ...block,
          properties: { 
            ...block.properties, 
            rows: updatedRows 
          }
        };
      }
      return block;
    }));
  };

  // Table Row Delete
  const removeTableRow = (blockId: string, rowIndex: number) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId && block.type === 'table' && block.properties?.rows) {
        if (block.properties.rows.length <= 1) return block; // Remain at least 1 row
        const updatedRows = block.properties.rows.filter((_, rIdx) => rIdx !== rowIndex);
        return {
          ...block,
          properties: { 
            ...block.properties, 
            rows: updatedRows 
          }
        };
      }
      return block;
    }));
  };

  // Table Column Delete 
  const removeTableColumn = (blockId: string, colIndex: number) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === blockId && block.type === 'table' && block.properties?.rows) {
        if (block.properties.rows[0].length <= 1) return block; // Remain at least 1 column
        const updatedRows = block.properties.rows.map(row => row.filter((_, cIdx) => cIdx !== colIndex));
        return {
          ...block,
          properties: { 
            ...block.properties, 
            rows: updatedRows 
          }
        };
      }
      return block;
    }));
  };

  // Block creation sequence updates
  const createNewBlockBelow = (index: number) => {
    triggerAutoSaveMarker();
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'paragraph',
      content: ''
    };
    const updated = [...blocks];
    updated.splice(index + 1, 0, newBlock);
    setBlocks(updated);
  };

  const insertBlockAt = (index: number) => {
    triggerAutoSaveMarker();
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'paragraph',
      content: ''
    };
    const updated = [...blocks];
    updated.splice(index, 0, newBlock);
    setBlocks(updated);
  };

  // Block deletion sequence updates
  const removeBlock = (id: string) => {
    triggerAutoSaveMarker();
    if (blocks.length === 1) {
      setBlocks([{ id: crypto.randomUUID(), type: 'paragraph', content: '' }]);
      return;
    }
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  // Block moving actions
  const moveBlockUp = (index: number) => {
    if (index === 0) return;
    triggerAutoSaveMarker();
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setBlocks(updated);
  };

  const moveBlockDown = (index: number) => {
    if (index === blocks.length - 1) return;
    triggerAutoSaveMarker();
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setBlocks(updated);
  };

  // Block code lang update
  const changeCodeLanguage = (id: string, language: string) => {
    triggerAutoSaveMarker();
    setBlocks(prev => prev.map(block => {
      if (block.id === id && block.type === 'code') {
        return {
          ...block,
          properties: { ...block.properties, language }
        };
      }
      return block;
    }));
  };

  // Draft saving mechanism
  const saveDocument = () => {
    onSaveDraft(title, blocks);
    setHasUnsavedChanges(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Export Markdown trigger
  const handleExportMarkdown = () => {
    const rawMarkdown = exportBlocksToMarkdown(blocks);
    const cleanedFilename = title.toLowerCase().replace(/\s+/g, "_") || "documento_ocr";
    downloadFile(rawMarkdown, `${cleanedFilename}.md`, "text/markdown");
  };

  // Trigger browser print helper style for HTML / PDF saves
  const handlePrintPdfDownload = () => {
    setShowPrintModal(true);
  };

  const handleDownloadPdfDirect = () => {
    setIsExportingPdf(true);
    setIsGeneratingPdfOutput(true);
    const cleanedFilename = title.replace(/[^\w\s-]/gi, '').toLowerCase().replace(/\s+/g, "_") || "documento";

    // Allow a small delay for React to perform DOM synchronization of the print frame before capture
    setTimeout(() => {
      const element = document.getElementById("print-frame-to-pdf");
      if (!element) {
        setIsExportingPdf(false);
        setIsGeneratingPdfOutput(false);
        return;
      }

      const opt = {
        margin:       [0.5, 0.5, 0.5, 0.5],
        filename:     `${cleanedFilename}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          letterRendering: true
        },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      html2pdf()
        .from(element)
        .set(opt as any)
        .save()
        .then(() => {
          setIsExportingPdf(false);
          setIsGeneratingPdfOutput(false);
          setShowPrintModal(false);
        })
        .catch((err: any) => {
          console.error("Direct PDF export failed:", err);
          setIsExportingPdf(false);
          setIsGeneratingPdfOutput(false);
          // Fallback triggers standard window print dialog
          try { window.print(); } catch (e) {}
        });
    }, 250);
  };

  const getFontFamilyClass = () => {
    switch(fontFamily) {
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      default: return 'font-sans';
    }
  };

  // Filter slash options
  const slashOptions = [
    { type: 'paragraph', label: 'Texto Párrafo', desc: 'Comenzar con texto plano', icon: <Bold size={14} /> },
    { type: 'h1', label: 'Título Grande', desc: 'Sección principal H1', icon: <Heading1 size={14} /> },
    { type: 'h2', label: 'Título Mediano', desc: 'Subsección mediana H2', icon: <Heading2 size={14} /> },
    { type: 'h3', label: 'Título Chico', desc: 'Subsección pequeña H3', icon: <Heading3 size={14} /> },
    { type: 'bulleted-list', label: 'Lista con viñetas', desc: 'Crear una lista simple', icon: <List size={14} /> },
    { type: 'numbered-list', label: 'Lista numerada', desc: 'Crear lista secuencial', icon: <ListOrdered size={14} /> },
    { type: 'todo', label: 'Lista de Tareas', desc: 'Tareas con casillas', icon: <CheckSquare size={14} /> },
    { type: 'quote', label: 'Cita Destacada', desc: 'Enmarcar cita textual', icon: <Quote size={14} /> },
    { type: 'code', label: 'Bloque de Código', desc: 'Escribir código o script', icon: <Code size={14} /> },
    { type: 'table', label: 'Tabla Interactiva', desc: 'Grilla de datos editable', icon: <TableIcon size={14} /> },
  ];

  const filteredSlashOptions = slashOptions.filter(opt => 
    opt.label.toLowerCase().includes(slashSearch.toLowerCase()) || 
    opt.type.toLowerCase().includes(slashSearch.toLowerCase())
  );

  return (
    <div className={`flex-1 flex flex-col h-screen overflow-hidden bg-white text-[#37352f] ${getFontFamilyClass()}`}>
      
      {/* GUI Interactiva: Oculta al Imprimir */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print:hidden">
        
        {/* Editor Main Bar (Topbar) */}
        <header id="editor-header" className="h-14 border-b border-[#ececeb] px-6 flex items-center justify-between bg-[#fbfbfa]/75 backdrop-blur shrink-0 select-none">
        
        {/* Info detail */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button 
            onClick={onExit}
            className="text-xs text-gray-400 hover:text-[#37352f] bg-[#efefe1]/50 px-2.5 py-1.5 rounded-md transition-all font-medium cursor-pointer"
          >
            ← Volver
          </button>
          
          <div className="h-4 w-[1px] bg-gray-200" />
          
          <span className="text-xs text-gray-400 truncate flex items-center gap-1.5 font-medium">
            <span>Editando:</span>
            <span className="text-gray-600 font-semibold truncate italic max-w-xs">"{title || "Sin título"}"</span>
          </span>

          {hasUnsavedChanges && (
            <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-250 rounded px-2 py-0.5 font-bold font-mono">
              CAMBIOS SIN GUARDAR
            </span>
          )}

          {saveSuccess && (
            <span className="text-[10px] bg-slate-900 text-white rounded px-2 py-0.5 font-bold font-mono">
              GUARDADO ✓
            </span>
          )}
        </div>

        {/* Toolbar document settings */}
        <div className="flex items-center gap-2">
          
          {/* Font Selector */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-[#ececeb] mr-2 text-[11px]">
            <button
              onClick={() => setFontFamily('sans')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${fontFamily === 'sans' ? 'bg-white shadow-3xs text-slate-950' : 'text-slate-455 hover:text-slate-800'}`}
              title="Tipografía Sans-Serif"
            >
              Sans
            </button>
            <button
              onClick={() => setFontFamily('serif')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${fontFamily === 'serif' ? 'bg-white shadow-3xs text-slate-950' : 'text-slate-455 hover:text-slate-800'}`}
              title="Tipografía Serif Editorial"
            >
              Serif
            </button>
            <button
              onClick={() => setFontFamily('mono')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${fontFamily === 'mono' ? 'bg-white shadow-3xs text-slate-950' : 'text-slate-455 hover:text-slate-800'}`}
              title="Tipografía Monospace Código"
            >
              Mono
            </button>
          </div>

          {/* Action triggers */}
          <button
            onClick={saveDocument}
            className="bg-slate-900 hover:bg-black text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
            title="Guardar documento actual en Borradores"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Guardar</span>
          </button>

          <button
            onClick={handlePrintPdfDownload}
            className="bg-[#2f2e2a] hover:bg-black text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
            title="Imprimir o Exportar PDF"
          >
            <Printer size={13} />
            <span className="hidden sm:inline">Exportar a PDF</span>
          </button>
        </div>
      </header>

      {/* Main interactive editable area */}
      <div className="flex-1 overflow-y-auto px-6 py-10 bg-white">
        
        {/* Document Canvas Sheet container */}
        <div className="max-w-3xl mx-auto bg-white mb-20">
          
          {/* Metadata banner displaying resource attachments & image gallery */}
          {scannedResources.length > 0 && (
            <div className="mb-6 p-4 bg-[#fcfcfb] border border-slate-200 rounded-xl shadow-3xs">
              <span className="text-[10px] text-slate-700 font-bold uppercase tracking-wider block mb-2 flex items-center gap-1.5 select-none">
                <FileText size={12} className="text-slate-500" />
                <span>Recursos e imágenes vinculados ({scannedResources.length})</span>
              </span>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {scannedResources.map((res, idx) => {
                  const isImg = res.type.toLowerCase().startsWith('image/') || 
                                res.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|svg)/);
                  
                  if (res.base64 && isImg) {
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          setSelectedGalleryIdx(idx);
                          setModalZoom(100);
                        }}
                        className="group relative cursor-zoom-in aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-slate-800 bg-white shadow-3xs transition-all duration-200 hover:scale-[1.02]"
                        title={`Ampliar: ${res.name}`}
                      >
                        <img 
                          src={res.base64} 
                          alt={res.name} 
                          className="w-full h-full object-cover group-hover:opacity-95 transition-all"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/80 pt-2 pb-1.5 px-2 text-center text-[9px] text-white font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {res.name}
                        </div>
                        <div className="absolute top-1 right-1 bg-slate-900 text-white rounded-full p-0.5 shadow-3xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 size={8} />
                        </div>
                      </div>
                    );
                  } else {
                    const isPdfCur = res.type.toLowerCase() === 'application/pdf' || res.name.toLowerCase().endsWith('.pdf');
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          setSelectedGalleryIdx(idx);
                          setModalZoom(100);
                        }}
                        className="group relative aspect-square rounded-lg border border-dashed border-slate-200 hover:border-slate-800 bg-white p-2.5 flex flex-col items-center justify-center text-center shadow-3xs cursor-zoom-in transition-all duration-200 hover:scale-[1.02]"
                        title={`Ver o ampliar: ${res.name} (${res.size ? (res.size / 1024).toFixed(1) : 0} KB)`}
                      >
                        <div className="p-1.5 bg-slate-50 group-hover:bg-slate-100 rounded-lg text-slate-500 mb-1 transition-colors">
                          <FileText size={18} className={isPdfCur ? "text-slate-800" : "text-slate-700"} />
                        </div>
                        <span className="text-[9px] font-medium text-slate-700 truncate w-full px-1 group-hover:text-slate-900 transition-colors">{res.name}</span>
                        <span className="text-[8px] text-slate-400 mt-0.5 font-mono">{res.size ? (res.size / 1024).toFixed(0) : 0} KB</span>
                        <div className="absolute top-1 right-1 bg-slate-900 text-white rounded-full p-0.5 shadow-2xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 size={8} />
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          )}

          {/* Notion cover plate spacing */}
          <div className="h-10 border-b border-[#ececeb]/50 group relative flex items-end mb-8">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">DOCUMENTO DIGITALIZADO • RECONSTRUCCIÓN ESTRUCTURAL</span>
          </div>

          {/* Large Notion Document Title block input */}
          <div className="mb-8 group">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                triggerAutoSaveMarker();
                setTitle(e.target.value);
              }}
              className="text-4xl font-extrabold w-full border-0 p-0 text-[#37352f] focus:ring-0 outline-none leading-tight placeholder-gray-200"
              placeholder="Sin título"
            />
          </div>

          {/* Virtual Block List Rows */}
          <div className="space-y-1.5">
            {blocks.map((block, index) => {
              
              const isFirst = index === 0;
              const isLast = index === blocks.length - 1;

              return (
                <div 
                  key={block.id} 
                  className="group relative flex items-start gap-2.5 -ml-12 px-1 rounded-md hover:bg-[#efefe1]/10 transition-colors py-1 pl-12"
                >
                  {/* Notion-Inspired Hover Inserter - perfectly thin, does not cover content, zero overlay displacement */}
                  <div 
                    className="absolute -top-[6px] left-[48px] right-2 h-3 group/inserter z-35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                    title="Agregar bloque aquí"
                  >
                    <div 
                      onClick={() => insertBlockAt(index)}
                      className="w-full h-0.5 bg-slate-250 hover:bg-slate-800 transition-colors cursor-pointer relative pointer-events-auto"
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white hover:bg-slate-900 text-slate-500 hover:text-white border border-slate-300 hover:border-slate-900 w-5 h-5 rounded-full flex items-center justify-center shadow-xs cursor-pointer text-xs font-bold transition-all transform hover:scale-115">
                        +
                      </div>
                    </div>
                  </div>

                  {isLast && (
                    <div 
                      className="absolute -bottom-[6px] left-[48px] right-2 h-3 group/inserter z-35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                      title="Agregar bloque al final"
                    >
                      <div 
                        onClick={() => insertBlockAt(index + 1)}
                        className="w-full h-0.5 bg-slate-250 hover:bg-slate-800 transition-colors cursor-pointer relative pointer-events-auto"
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white hover:bg-slate-900 text-slate-500 hover:text-white border border-slate-300 hover:border-slate-900 w-5 h-5 rounded-full flex items-center justify-center shadow-xs cursor-pointer text-xs font-bold transition-all transform hover:scale-115">
                          +
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Left block handles (Grip selectors like Notion) inside the pl-12 gutter */}
                  <div className={`absolute left-1 top-[7px] flex items-center transition-opacity duration-150 text-gray-400 gap-0.5 select-none z-40 ${
                    activeMenuBlockId === block.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  }`}>
                    {/* Add block below button */}
                    <button 
                      onClick={() => createNewBlockBelow(index)}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                      title="Agregar bloque abajo"
                    >
                      <Plus size={13} />
                    </button>

                    {/* Notion Grip drag & option handler */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuBlockId(activeMenuBlockId === block.id ? null : block.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                      title="Opciones de bloque"
                    >
                      <GripVertical size={13} />
                    </button>
                  </div>

                  {/* Notion-Inspired Block Actions & Conversion Dropdown */}
                  {activeMenuBlockId === block.id && (
                    <div 
                      ref={blockMenuRef}
                      className="absolute left-10 top-7 z-50 w-56 bg-white border border-[#ececeb] rounded-lg shadow-xl py-1.5 text-xs text-[#37352f] overflow-visible select-none animate-in fade-in zoom-in-95 duration-100"
                    >
                      <div className="px-3 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-widest">
                        Acciones
                      </div>
                      <button
                        onClick={() => {
                          moveBlockUp(index);
                          setActiveMenuBlockId(null);
                        }}
                        disabled={isFirst}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-slate-700"
                      >
                        <ChevronUp size={13} className="text-slate-400" />
                        <span>Mover arriba</span>
                      </button>
                      <button
                        onClick={() => {
                          moveBlockDown(index);
                          setActiveMenuBlockId(null);
                        }}
                        disabled={isLast}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-slate-700"
                      >
                        <ChevronDown size={13} className="text-slate-400" />
                        <span>Mover abajo</span>
                      </button>
                      <button
                        onClick={() => {
                          createNewBlockBelow(index);
                          setActiveMenuBlockId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors cursor-pointer text-slate-700"
                      >
                        <Plus size={13} className="text-slate-400" />
                        <span>Agregar bloque abajo</span>
                      </button>
                      <button
                        onClick={() => {
                          removeBlock(block.id);
                          setActiveMenuBlockId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 text-red-650 font-medium transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} className="text-red-400" />
                        <span>Eliminar bloque</span>
                      </button>

                      <div className="h-[1px] bg-slate-150 my-1.5" />

                      <div className="px-3 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-widest">
                        Convertir bloque a...
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                        {[
                          { type: 'paragraph', label: 'Texto plano', icon: <Bold size={12} /> },
                          { type: 'h1', label: 'Título Grande H1', icon: <Heading1 size={12} /> },
                          { type: 'h2', label: 'Título Mediano H2', icon: <Heading2 size={12} /> },
                          { type: 'h3', label: 'Título Chico H3', icon: <Heading3 size={12} /> },
                          { type: 'bulleted-list', label: 'Lista con viñetas', icon: <List size={12} /> },
                          { type: 'numbered-list', label: 'Lista numerada', icon: <ListOrdered size={12} /> },
                          { type: 'todo', label: 'Lista de tareas', icon: <CheckSquare size={12} /> },
                          { type: 'quote', label: 'Cita destacada', icon: <Quote size={12} /> },
                          { type: 'code', label: 'Código', icon: <Code size={12} /> },
                          { type: 'table', label: 'Tabla interactiva', icon: <TableIcon size={12} /> },
                        ].map(opt => (
                          <button
                            key={opt.type}
                            disabled={block.type === opt.type}
                            onClick={() => {
                              updateBlockType(block.id, opt.type as any);
                              setActiveMenuBlockId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 text-slate-700 transition-colors disabled:bg-slate-100/50 disabled:text-slate-400 cursor-pointer"
                          >
                            <div className="w-5 h-5 rounded bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                              {opt.icon}
                            </div>
                            <span className="truncate">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Block Content switches */}
                  <div className="flex-1 w-full min-w-0">
                    
                    {/* H1 header rendering */}
                    {block.type === 'h1' && (
                      <AutoResizeTextarea
                        value={block.content}
                        onChange={(e) => updateBlockContent(block.id, e.target.value)}
                        className="w-full border-0 p-0 text-2xl font-extrabold text-[#37352f] tracking-tight bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-1"
                        placeholder="Título 1"
                      />
                    )}

                    {/* H2 header rendering */}
                    {block.type === 'h2' && (
                      <AutoResizeTextarea
                        value={block.content}
                        onChange={(e) => updateBlockContent(block.id, e.target.value)}
                        className="w-full border-0 p-0 text-xl font-bold text-[#37352f] tracking-tight bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-1"
                        placeholder="Título 2"
                      />
                    )}

                    {/* H3 header rendering */}
                    {block.type === 'h3' && (
                      <AutoResizeTextarea
                        value={block.content}
                        onChange={(e) => updateBlockContent(block.id, e.target.value)}
                        className="w-full border-0 p-0 text-lg font-bold text-[#37352f] tracking-semibold bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-1"
                        placeholder="Título 3"
                      />
                    )}

                    {/* Paragraph default type rendering */}
                    {block.type === 'paragraph' && (
                      <AutoResizeTextarea
                        value={block.content}
                        onChange={(e) => updateBlockContent(block.id, e.target.value)}
                        className="w-full border-0 p-0 text-sm leading-relaxed text-[#37352f] bg-transparent focus:ring-0 outline-none placeholder-gray-300/60 min-h-[22px]"
                        placeholder="Escribe algo o presiona '/' para comandos..."
                      />
                    )}

                    {/* Bullet List Row Type */}
                    {block.type === 'bulleted-list' && (
                      <div className="flex items-start gap-2 py-0.5">
                        <span className="text-[#37352f]/50 select-none mt-1 font-bold shrink-0 text-sm">•</span>
                        <AutoResizeTextarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full border-0 p-0 text-sm leading-relaxed text-[#37352f] bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-0.5"
                          placeholder="Elemento de lista"
                        />
                      </div>
                    )}

                    {/* Numbered List Row Type */}
                    {block.type === 'numbered-list' && (
                      <div className="flex items-start gap-2 py-0.5">
                        <span className="text-[#37352f]/40 select-none mt-0.5 shrink-0 text-xs font-semibold font-mono">
                          {(() => {
                            // Find sequence count
                            let seq = 1;
                            for (let i = index - 1; i >= 0; i--) {
                              if (blocks[i].type === 'numbered-list') seq++;
                              else break;
                            }
                            return `${seq}.`;
                          })()}
                        </span>
                        <AutoResizeTextarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full border-0 p-0 text-sm leading-relaxed text-[#37352f] bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-0.5"
                          placeholder="Elemento de lista numerada"
                        />
                      </div>
                    )}

                    {/* Todo Box list item Type */}
                    {block.type === 'todo' && (
                      <div className="flex items-start gap-2.5 py-0.5">
                        <button
                          onClick={() => toggleTodoCheck(block.id)}
                          className={`mt-1 shrink-0 w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                            block.properties?.checked 
                              ? 'bg-[#2f2e2a] border-[#2f2e2a] text-white' 
                              : 'border-gray-300 hover:border-[#2f2e2a] bg-white'
                          }`}
                        >
                          {block.properties?.checked && <span className="text-[10px] leading-none font-bold">✓</span>}
                        </button>
                        <AutoResizeTextarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className={`w-full border-0 p-0 text-sm leading-relaxed text-[#37352f] bg-transparent focus:ring-0 outline-none placeholder-gray-300 py-0.5 ${
                            block.properties?.checked ? 'line-through text-gray-400' : ''
                          }`}
                          placeholder="Elemento de tarea"
                        />
                      </div>
                    )}

                    {/* Blockquote Quote Type */}
                    {block.type === 'quote' && (
                      <div className="border-l-3 border-[#2f2e2a] pl-4 py-1.5 italic text-gray-600 bg-[#fbfbfa] rounded-r my-1">
                        <AutoResizeTextarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full border-0 p-0 text-sm leading-relaxed text-gray-600 bg-transparent focus:ring-0 outline-none placeholder-gray-400"
                          placeholder="Cita destacada"
                        />
                      </div>
                    )}

                    {/* Block Markdown/Code Editor */}
                    {block.type === 'code' && (
                      <div className="bg-[#f4f4f3] border border-[#ececeb] rounded-lg overflow-hidden my-2">
                        {/* Selector header */}
                        <div className="px-3 py-1.5 border-b border-[#ececeb] bg-[#fbfbfa] flex items-center justify-between text-[11px] font-mono select-none">
                          <span className="text-gray-500">BLOQUE DE CODIGO</span>
                          <select
                            value={block.properties?.language || "javascript"}
                            onChange={(e) => changeCodeLanguage(block.id, e.target.value)}
                            className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[10px] outline-none font-mono text-gray-600 cursor-pointer"
                          >
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="json">JSON</option>
                            <option value="python">Python</option>
                            <option value="sql">SQL</option>
                          </select>
                        </div>
                        <AutoResizeTextarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full border-0 p-3 font-mono text-xs leading-5 text-amber-800 bg-transparent focus:ring-0 outline-none min-h-[80px]"
                          placeholder="Escribe o pega aquí el código..."
                        />
                      </div>
                    )}

                    {/* Raw Image Block (No borders, gray frames, or captions) */}
                    {block.type === 'image' && (
                      <div className="my-4 relative group/img flex flex-col items-center justify-center">
                        {block.properties?.imageUrl ? (
                          block.properties.imageUrl.startsWith("data:application/pdf") || block.properties.imageUrl.endsWith(".pdf") ? (
                            <object
                              data={block.properties.imageUrl}
                              type="application/pdf"
                              className="w-full h-80 border-0 rounded-md shadow-xs bg-white"
                            >
                              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                                <FileText size={40} className="text-red-500 mb-2" />
                                <p className="text-xs font-semibold text-gray-750">Documento PDF cargado</p>
                              </div>
                            </object>
                          ) : (
                            <img 
                              src={block.properties.imageUrl} 
                              alt={block.content} 
                              className="max-h-96 mx-auto object-contain rounded-lg shadow-sm" 
                            />
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-dashed border-gray-200 rounded-lg text-gray-400">
                            <ImageIcon size={32} className="text-gray-300 mb-1" />
                            <span className="text-xs text-gray-500 font-medium">Marcador de posición de Imagen</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interactive Table block type */}
                    {block.type === 'table' && block.properties?.rows && (
                      <div className="my-4 overflow-x-auto border border-[#ececeb] rounded-lg bg-white shadow-xs">
                        
                        {/* Interactive Table Toolbox header options */}
                        <div className="px-3 py-2 border-b border-[#ececeb] bg-[#fbfbfa] flex items-center justify-between text-[11px] text-gray-500 select-none">
                          <span className="font-semibold flex items-center gap-1">
                            <TableIcon size={12} className="text-amber-500" />
                            <span>TABLA EDITABLE OCR</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => addTableRow(block.id)}
                              className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <PlusCircle size={10} /> Add Fila
                            </button>
                            <button
                              onClick={() => addTableColumn(block.id)}
                              className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <PlusCircle size={10} /> Add Columna
                            </button>
                          </div>
                        </div>

                        {/* Traditional HTML Table layout with cell editors inside */}
                        <table className="w-full min-w-[400px] border-collapse text-left">
                          <tbody>
                            {block.properties.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-[#ececeb] group/row">
                                {row.map((cell, cIdx) => {
                                  
                                  const isHeader = rIdx === 0;

                                  return (
                                    <td 
                                      key={cIdx} 
                                      className={`group/cell border-r border-[#ececeb] relative min-w-[120px] p-0 ${
                                        isHeader ? 'bg-slate-50/70 font-semibold' : ''
                                      }`}
                                    >
                                      <AutoResizeTextarea
                                        value={cell}
                                        onChange={(e) => updateTableCell(block.id, rIdx, cIdx, e.target.value)}
                                        className={`w-full border-0 p-2.5 bg-transparent focus:bg-amber-50/20 outline-none text-xs leading-relaxed block ${
                                          isHeader ? 'font-bold text-[#37352f] pr-6' : 'text-gray-700'
                                        }`}
                                        placeholder={isHeader ? "Columna..." : "Celda..."}
                                      />
                                      
                                      {/* Column Delete trigger button visible on Column 1 Header hover */}
                                      {isHeader && row.length > 1 && (
                                        <button
                                          onClick={() => removeTableColumn(block.id, cIdx)}
                                          className="absolute right-1 top-2.5 opacity-0 group-hover/cell:opacity-100 hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-all duration-150 cursor-pointer text-center z-10"
                                          title="Borrar Columna"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </td>
                                  );
                                })}

                                {/* Row Delete trigger button */}
                                <td className="w-8 border-0 bg-transparent text-center align-middle h-full text-xs p-1 select-none">
                                  {block.properties.rows && block.properties.rows.length > 1 && (
                                    <button
                                      onClick={() => removeTableRow(block.id, rIdx)}
                                      className="opacity-0 group-hover/row:opacity-100 hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-all duration-150 mx-auto block cursor-pointer"
                                      title="Borrar Fila"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>

                  {/* Absolute Popup slash command selector */}
                  {showSlashMenu === block.id && (
                    <div 
                      ref={slashMenuRef}
                      className="absolute left-12 top-8 z-55 w-64 bg-white border border-gray-200 rounded-lg shadow-xl py-2 overflow-hidden select-none"
                    >
                      <div className="px-3 py-1.5 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Tipos de Bloques
                      </div>
                      
                      <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                        {filteredSlashOptions.length > 0 ? (
                          filteredSlashOptions.map(opt => (
                            <button
                              key={opt.type}
                              onClick={() => updateBlockType(block.id, opt.type as any)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              <div className="w-6 h-6 rounded bg-[#2f2e2a]/5 text-[#2f2e2a] flex items-center justify-center shrink-0">
                                {opt.icon}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[#37352f] leading-none">{opt.label}</p>
                                <p className="text-[10px] text-gray-400 truncate mt-1 leading-none">{opt.desc}</p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-gray-400 italic text-center">
                            Sin coincidencias
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Quick interactive floating footer toolbar helper */}
          <div className="mt-12 pt-8 border-t border-[#ececeb]/50 text-center select-none">
            <button
              onClick={() => {
                triggerAutoSaveMarker();
                const newB: Block = { id: crypto.randomUUID(), type: 'paragraph', content: '' };
                setBlocks([...blocks, newB]);
              }}
              className="inline-flex items-center gap-1.5 border border-slate-200 hover:border-slate-800 bg-white text-[11px] py-2 px-4 rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer font-semibold shadow-3xs"
            >
              <Plus size={14} className="text-slate-800" />
              <span>Añadir bloque final al documento</span>
            </button>
          </div>

        </div>
      </div>

      {/* Fin de GUI Interactiva */}
      </div>

      {/* Marco de impresión de alta fidelidad: Solo visible al imprimir, exportar a PDF o cuando se está generando el PDF */}
      <div 
        id="print-frame-to-pdf" 
        className={`${isGeneratingPdfOutput ? 'block fixed inset-0 bg-white z-[150] overflow-y-auto p-12 text-[#37352f]' : 'hidden print:block'} print-frame bg-white text-[#37352f] max-w-4xl mx-auto`}
      >
        <h1 className="text-3xl font-extrabold mb-6 tracking-tight border-b pb-4 text-[#37352f]">{title || "Documento Extraído"}</h1>
        <div className="space-y-4">
          {blocks.map((block) => {
            switch (block.type) {
              case 'h1':
                return <h1 key={block.id} className="text-2xl font-extrabold mt-8 mb-3 tracking-tight text-[#37352f]" dangerouslySetInnerHTML={{ __html: block.content }} />;
              case 'h2':
                return <h2 key={block.id} className="text-xl font-bold mt-6 mb-2 tracking-tight text-[#37352f]" dangerouslySetInnerHTML={{ __html: block.content }} />;
              case 'h3':
                return <h3 key={block.id} className="text-lg font-bold mt-5 mb-2 tracking-tight text-[#37352f]" dangerouslySetInnerHTML={{ __html: block.content }} />;
              case 'paragraph':
                return <p key={block.id} className="text-sm leading-relaxed my-2 text-justify whitespace-pre-wrap text-[#37352f]" dangerouslySetInnerHTML={{ __html: block.content }} />;
              case 'bulleted-list':
                return (
                  <ul key={block.id} className="list-disc pl-5 my-2 text-sm text-[#37352f]">
                    <li dangerouslySetInnerHTML={{ __html: block.content }} />
                  </ul>
                );
              case 'numbered-list':
                return (
                  <ol key={block.id} className="list-decimal pl-5 my-2 text-sm text-[#37352f]">
                    <li dangerouslySetInnerHTML={{ __html: block.content }} />
                  </ol>
                );
              case 'todo':
                return (
                  <div key={block.id} className="flex items-start gap-2.5 my-2 text-sm text-[#37352f]">
                    <span className="font-mono text-sm shrink-0 select-none">{block.properties?.checked ? '☑' : '☐'}</span>
                    <span className={block.properties?.checked ? 'line-through text-gray-400 font-medium' : 'font-medium'} dangerouslySetInnerHTML={{ __html: block.content }} />
                  </div>
                );
              case 'quote':
                return (
                  <blockquote key={block.id} className="border-l-4 border-slate-900 pl-4 italic text-slate-800 my-4 bg-slate-50 py-2 rounded-r text-sm pr-2" dangerouslySetInnerHTML={{ __html: block.content }} />
                );
              case 'code':
                return (
                  <pre key={block.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-3 font-mono text-xs overflow-x-auto text-slate-850 leading-relaxed">
                    <code>{block.content}</code>
                  </pre>
                );
              case 'image':
                const isPdfUrl = block.properties?.imageUrl?.startsWith('data:application/pdf') || block.properties?.imageUrl?.endsWith('.pdf');
                return block.properties?.imageUrl ? (
                  <div key={block.id} className="my-6 text-center break-inside-avoid">
                    {isPdfUrl ? (
                      <div className="w-full border border-gray-150 rounded-xl overflow-hidden bg-white shadow-xs mx-auto max-w-2xl text-left">
                        <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between">
                          <span className="flex items-center gap-2 text-xs font-semibold text-red-750">
                            <FileText size={14} className="text-red-500" />
                            <span>DOCUMENTO PDF EXTRACTO</span>
                          </span>
                          <a 
                            href={block.properties.imageUrl} 
                            download={block.content || "documento.pdf"}
                            className="text-[10px] bg-white hover:bg-red-100 text-red-700 border border-red-200 font-bold px-2.5 py-1 rounded transition-colors"
                          >
                            Descargar PDF
                          </a>
                        </div>
                        <div className="p-4 bg-slate-50 flex items-center justify-center">
                          <object 
                            data={block.properties.imageUrl} 
                            type="application/pdf" 
                            className="w-full h-96 rounded-md shadow-xs border border-gray-200/60"
                          >
                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                              <FileText size={48} className="text-red-400 mb-2.5 animate-bounce" />
                              <p className="text-xs font-semibold text-gray-750">Visor de PDF no soportado en tu navegador</p>
                              <p className="text-[10px] text-gray-400 mt-1 max-w-xs">Puedes descargar este archivo directamente para revisar su contenido.</p>
                            </div>
                          </object>
                        </div>
                      </div>
                    ) : (
                      <img src={block.properties.imageUrl} alt={block.content} className="max-h-96 mx-auto object-contain rounded-lg shadow-sm" />
                    )}
                  </div>
                ) : null;
              case 'table':
                return block.properties?.rows ? (
                  <div key={block.id} className="my-6 overflow-x-auto border border-gray-200 rounded-lg shadow-2xs break-inside-avoid">
                    <table className="w-full border-collapse text-left text-xs">
                      <tbody>
                        {block.properties.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="border-b border-gray-200">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className={`border border-gray-200 p-2.5 ${rIdx === 0 ? 'font-bold bg-gray-50/75 text-gray-800' : 'text-gray-600'}`} dangerouslySetInnerHTML={{ __html: cell }} />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null;
              default:
                return null;
            }
          })}
        </div>
      </div>

      {/* Export to PDF / Print Guidance Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Printer className="text-slate-700" size={14} />
                <span>Exportar a PDF</span>
              </h3>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 hover:bg-slate-100 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 text-center space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Descarga una copia de alta fidelidad de este documento para guardarlo directamente en tu computadora o dispositivo como un archivo PDF oficial.
              </p>

              <button 
                onClick={handleDownloadPdfDirect}
                disabled={isExportingPdf}
                className="w-full bg-[#2f2e2a] hover:bg-black disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs py-3 px-4 rounded-lg transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                {isExportingPdf ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    <span>Generando archivo PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown size={14} />
                    <span>Descargar archivo PDF</span>
                  </>
                )}
              </button>
            </div>
            
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowPrintModal(false)}
                className="bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-700 font-semibold text-xs px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isGeneratingPdfOutput && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-xs z-[200] flex flex-col items-center justify-center p-6 select-none animate-fade-in">
          <div className="flex flex-col items-center gap-4 text-center max-w-xs">
            <RefreshCw className="animate-spin text-slate-800" size={32} />
            <div>
              <p className="text-sm font-bold text-slate-800">Exportando su PDF de Alta Fidelidad</p>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Generando el archivo final garantizando los encabezados, listas y tablas... No cierre esta pestaña.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Expanded Image Preview Gallery Modal */}
      {selectedGalleryIdx !== null && (() => {
        const currentRes = scannedResources[selectedGalleryIdx];
        if (!currentRes) return null;

        // Extract list of all images and PDFs for next-prev navigation
        const imageResources = scannedResources.map((res, originalIdx) => ({
          ...res,
          originalIdx
        })).filter(res => {
          return res.type.toLowerCase().startsWith('image/') || 
                 res.type.toLowerCase() === 'application/pdf' ||
                 res.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|svg|pdf)/);
        });

        const currentImgIdx = imageResources.findIndex(img => img.originalIdx === selectedGalleryIdx);
        const totalImages = imageResources.length;

        const handlePrevImg = () => {
          if (currentImgIdx > 0) {
            setSelectedGalleryIdx(imageResources[currentImgIdx - 1].originalIdx);
            setModalZoom(100);
          }
        };

        const handleNextImg = () => {
          if (currentImgIdx < totalImages - 1) {
            setSelectedGalleryIdx(imageResources[currentImgIdx + 1].originalIdx);
            setModalZoom(100);
          }
        };

        return (
          <div className="fixed inset-0 z-[120] flex flex-col bg-black/92 backdrop-blur-md select-none animate-fade-in">
            {/* Top Bar Controls */}
            <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-black/30 shrink-0">
              <div className="flex flex-col min-w-0">
                <span className="text-white font-semibold text-sm truncate max-w-md sm:max-w-xl">
                  {currentRes.name}
                </span>
                <span className="text-gray-400 text-[10px] uppercase font-mono tracking-wider">
                  Recurso {currentImgIdx >= 0 ? currentImgIdx + 1 : 1} de {totalImages || 1} • {currentRes.size ? (currentRes.size / 1024).toFixed(1) : 0} KB
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Download item */}
                <button
                  onClick={() => {
                    if (currentRes.base64) {
                      downloadFile(currentRes.base64, currentRes.name, currentRes.type);
                    }
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white hover:text-white font-semibold text-xs px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5"
                  title="Descargar archivo original"
                >
                  <FileDown size={13} className="text-slate-300" />
                  <span className="hidden sm:inline">Descargar</span>
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setSelectedGalleryIdx(null)}
                  className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition-all cursor-pointer text-sm font-bold w-9 h-9 flex items-center justify-center"
                  title="Cerrar vista ampliada (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Central Viewport Area */}
            <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 overflow-hidden">
              {/* Previous Image Chevron */}
              {currentImgIdx > 0 && (
                <button
                  onClick={handlePrevImg}
                  className="absolute left-4 z-10 bg-black/60 hover:bg-black/90 text-white border border-white/15 p-3 rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Imagen Anterior"
                >
                  <ChevronLeft size={22} className="text-slate-300" />
                </button>
              )}

              {/* Central Box with Zoom Transform */}
              <div className="max-h-full max-w-full overflow-auto p-4 flex items-center justify-center w-full">
                <div 
                  className="transition-transform duration-200 ease-out flex items-center justify-center w-full"
                  style={{ transform: `scale(${modalZoom / 100})` }}
                >
                  {currentRes.type.toLowerCase() === 'application/pdf' || currentRes.name.toLowerCase().endsWith('.pdf') ? (
                    <object
                      data={currentRes.base64}
                      type="application/pdf"
                      className="w-[85vw] max-w-4xl h-[70vh] rounded shadow-2xl border border-white/15 bg-white"
                    >
                      <div className="flex flex-col items-center justify-center bg-neutral-900 border border-white/10 p-10 select-all rounded h-[50vh] text-center w-[85vw] max-w-2xl">
                        <FileText size={56} className="text-red-400 mb-4 animate-bounce" />
                        <h4 className="text-white text-sm font-semibold">El navegador no puede empotrar la vista previa del PDF</h4>
                        <p className="text-gray-400 text-xs mt-1.5 max-w-md leading-relaxed">
                          Puedes descargar el archivo haciendo clic en el botón de descarga situado en la esquina superior derecha o añadirlo al editor como bloque para consultarlo.
                        </p>
                      </div>
                    </object>
                  ) : (
                    <img 
                      src={currentRes.base64} 
                      alt={currentRes.name} 
                      className="max-h-[70vh] max-w-full rounded shadow-2xl object-contain border border-white/10 bg-neutral-900 pointer-events-none"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              </div>

              {/* Next Image Chevron */}
              {currentImgIdx < totalImages - 1 && (
                <button
                  onClick={handleNextImg}
                  className="absolute right-4 z-10 bg-black/60 hover:bg-black/90 text-white border border-white/15 p-3 rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Imagen Siguiente"
                >
                  <ChevronRight size={22} className="text-slate-300" />
                </button>
              )}
            </div>

            {/* Bottom Panel Controls */}
            <div className="h-16 border-t border-white/10 bg-black/45 px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1 text-[11px] text-gray-400 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5 select-none">
                <span className="font-bold text-slate-300">Guía:</span> Puede cerrar la ventana pulsando la tecla <span className="font-semibold text-white bg-white/10 px-1 rounded">Esc</span>
              </div>

              {/* Center Zoom Controls */}
              <div className="flex items-center gap-3 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10">
                <button
                  onClick={() => setModalZoom(prev => Math.max(50, prev - 25))}
                  className="text-gray-300 hover:text-white p-1 hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                  title="Alejar Zoom (-)"
                  disabled={modalZoom <= 50}
                >
                  <ZoomOut size={16} />
                </button>

                <span className="text-xs font-bold text-white font-mono w-14 text-center select-none">
                  {modalZoom}%
                </span>

                <button
                  onClick={() => setModalZoom(prev => Math.min(300, prev + 25))}
                  className="text-gray-300 hover:text-white p-1 hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                  title="Acercar Zoom (+)"
                  disabled={modalZoom >= 300}
                >
                  <ZoomIn size={16} />
                </button>

                <div className="w-px h-4 bg-white/20 self-center mx-1"></div>

                <button
                  onClick={() => setModalZoom(100)}
                  className="text-gray-300 hover:text-white hover:bg-white/5 p-1 rounded-full transition-colors font-semibold text-[10px] tracking-wide cursor-pointer flex items-center gap-0.5"
                  title="Restaurar tamaño original"
                >
                  <Maximize2 size={13} />
                  <span>1:1</span>
                </button>
              </div>

              {/* Action: Place block in editor */}
              <div>
                <button
                  onClick={() => {
                    triggerAutoSaveMarker();
                    const newImageBlock: Block = {
                      id: crypto.randomUUID(),
                      type: 'image',
                      content: `Documento cargado: ${currentRes.name}`,
                      properties: { imageUrl: currentRes.base64 }
                    };
                    setBlocks(prev => [...prev, newImageBlock]);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 hover:scale-[1.01] font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  title="Añadir esta imagen original como bloque final del editor"
                >
                  <PlusCircle size={14} className="text-slate-800" />
                  <span>Añadir al editor</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
