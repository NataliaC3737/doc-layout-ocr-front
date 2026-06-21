import React, { useState, useRef, useEffect } from "react";
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Sparkles, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { formatBytes } from "../utils";
import { ResourceFile } from "../types";

interface UploaderProps {
  onOcrComplete: (html: string, processedFiles: ResourceFile[], cvRegions?: any[], modelUsed?: string) => void;
}

const CYCLING_MESSAGES = [
  "Inicializando el motor de análisis estructural de documentos...",
  "Transfiriendo archivos de forma segura a la API de conversión...",
  "Identificando la estructura jerárquica y el diseño espacial...",
  "Segmentando elementos gráficos, sellos y rúbricas de origen...",
  "Extrayendo contenido semántico con alto nivel de precisión...",
  "Generando marcado HTML semántico y formateo de párrafos...",
  "Procesando celdas, filas y columnas del bloque de tablas...",
  "Sincronizando recursos gráficos y recortes de alta resolución...",
  "Consolidando bloques interactivos para el editor web..."
];

export default function Uploader({ onOcrComplete }: UploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; base64: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadMessageIndex, setLoadMessageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cycle through loading status messages
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      interval = setInterval(() => {
        setLoadMessageIndex((prev) => (prev + 1) % CYCLING_MESSAGES.length);
      }, 3000);
    } else {
      setLoadMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Convert File to Base64 safely and perform premium compression
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const resultStr = reader.result as string;
        if (file.type.startsWith("image/")) {
          const img = new Image();
          img.src = resultStr;
          img.onload = () => {
            const maxDim = 1200; 
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85); // High quality
              resolve(compressedBase64);
            } else {
              resolve(resultStr);
            }
          };
          img.onerror = () => {
            resolve(resultStr);
          };
        } else {
          resolve(resultStr);
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const addFilesToQueue = async (fileList: FileList) => {
    setErrorMessage(null);
    const validFiles: { file: File; base64: string }[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isValidType = file.type === "application/pdf" || file.type.startsWith("image/");
      
      if (!isValidType) {
        setErrorMessage("Formato no compatible. Admite únicamente arquivos PDF o archivos de Imagen.");
        continue;
      }

      try {
        const base64 = await convertFileToBase64(file);
        if (!selectedFiles.some(f => f.file.name === file.name && f.file.size === file.size)) {
          validFiles.push({ file, base64 });
        }
      } catch (err) {
        console.error("Error al codificar el documento original:", file.name, err);
      }
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await addFilesToQueue(e.target.files);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeFileFromQueue = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearQueue = () => {
    setSelectedFiles([]);
    setErrorMessage(null);
  };

  const startOcrProcessing = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);

    const payloadFiles = selectedFiles.map(item => ({
      name: item.file.name,
      type: item.file.type,
      base64: item.base64
    }));

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payloadFiles })
      });

      let responseData: any;
      const responseText = await response.text();

      if (!response.ok) {
        let errMsg = `Error del servidor de conversión (${response.status} ${response.statusText})`;
        try {
          const errJson = JSON.parse(responseText);
          errMsg = errJson.error || errMsg;
        } catch {
          if (responseText.includes("<title>")) {
            const titleMatch = responseText.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              errMsg = `Ocurrió un error en el servidor (${response.status}): ${titleMatch[1].trim()}`;
            }
          } else if (responseText.trim().length > 0 && responseText.length < 200) {
            errMsg = responseText.trim();
          }
        }
        throw new Error(errMsg);
      }

      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("No se pudo analizar la respuesta:", responseText);
        throw new Error("El sistema de conversión recibió una respuesta en formato no estructurado.");
      }

      const uploadImageToServer = async (b64: string, filename: string): Promise<string> => {
        if (!b64 || !b64.startsWith("data:")) return b64;
        try {
          const uploadRes = await fetch("/api/upload-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64: b64, filename })
          });
          if (uploadRes.ok) {
            const resJson = await uploadRes.json();
            if (resJson.url) {
              const origin = window.location.origin;
              return `${origin}${resJson.url}`;
            }
          }
        } catch (err) {
          console.warn(`[Storage] No fue posible persistir el recurso ${filename}:`, err);
        }
        return b64;
      };

      const parser = new DOMParser();
      const doc = parser.parseFromString(responseData.html || "", "text/html");
      const imgElements = doc.querySelectorAll("img");

      // 1. Upload original files
      const uploadedMetadata: ResourceFile[] = [];
      for (const item of selectedFiles) {
        if (item.base64 && item.base64.startsWith("data:")) {
          const urlStr = await uploadImageToServer(item.base64, item.file.name);
          uploadedMetadata.push({
            name: item.file.name,
            type: item.file.type,
            size: item.file.size,
            base64: urlStr,
            url: urlStr
          });
        } else {
          uploadedMetadata.push({
            name: item.file.name,
            type: item.file.type,
            size: item.file.size,
            base64: item.base64,
            url: item.base64
          });
        }
      }

      // 2. Upload and map embedded graphics
      let cropCounter = 1;
      for (const img of Array.from(imgElements)) {
        const src = img.getAttribute("src") || "";
        const alt = img.getAttribute("alt") || "Elemento_Digitalizado";
        
        if (src.startsWith("data:image/")) {
          const filename = `reconstruction_${alt.replace(/[^a-zA-Z0-9]/g, "_")}_${cropCounter++}.jpeg`;
          const serverUrl = await uploadImageToServer(src, filename);
          
          img.setAttribute("src", serverUrl);

          uploadedMetadata.push({
            name: `Recorte: ${alt}`,
            type: "image/jpeg",
            size: Math.round(src.length * 0.75),
            base64: serverUrl,
            url: serverUrl
          });
        }
      }

      const finalHtmlString = doc.body.innerHTML || responseData.html || "";
      onOcrComplete(finalHtmlString, uploadedMetadata, [], responseData.modelUsed);

    } catch (err: any) {
      console.error("Fallo durante el procesamiento del documento:", err);
      setErrorMessage(err.message || "Error inesperado de comunicación con la API oficial.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-6 font-sans">
      
      {/* Title & Descriptors */}
      <div className="text-center mb-10">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Procesamiento y maquetación de documentos
        </h1>
        <p className="text-slate-500 mt-2 text-xs leading-relaxed max-w-md mx-auto">
          Carga un archivo en formato PDF o Imagen. El sistema analizará de forma directa su estructura espacial y semántica para generar un maquetado digital con elementos jerárquicos editables de alta fidelidad.
        </p>
      </div>

      {!isProcessing ? (
        <div className="space-y-6">
          {/* Main Drag & Drop Zone */}
          <div
            id="dropzone"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 min-h-[170px] ${
              dragActive 
                ? "border-slate-900 bg-slate-50" 
                : "border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFileInputChange}
            />
            
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 mb-3 text-slate-400">
              <Upload size={20} className="text-slate-700" />
            </div>
            
            <p className="text-xs font-semibold text-slate-800">
              Selecciona o arrastra el documento aquí
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Formatos aceptados: PDF, PNG, JPG, WebP (máx. 50 MB)
            </p>
          </div>

          {/* Minimal Grey Alert error message box */}
          {errorMessage && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-slate-700 text-xs">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-slate-500" />
              <div>
                <span className="font-semibold text-slate-800">Error de procesamiento:</span>
                <p className="mt-0.5 text-slate-600 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Simple Clean Queued list */}
          {selectedFiles.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              
              {/* Box header */}
              <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Documentos listos para conversión ({selectedFiles.length})
                </span>
                <button 
                  onClick={clearQueue}
                  className="text-[11px] text-slate-500 hover:text-slate-900 transition-colors font-medium cursor-pointer"
                >
                  Vaciar cola
                </button>
              </div>

              {/* Items */}
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {selectedFiles.map((item, index) => {
                  const isPdf = item.file.type === "application/pdf";
                  return (
                    <div key={index} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 bg-white">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 bg-slate-100 rounded text-slate-500 shrink-0">
                          {isPdf ? <FileText size={14} /> : <ImageIcon size={14} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{item.file.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(item.file.size)}</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => removeFileFromQueue(index)}
                        className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-all cursor-pointer"
                        title="Eliminar de cola"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Box Action Footer panel */}
              <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end">
                <button
                  id="process-ocr-btn"
                  onClick={startOcrProcessing}
                  className="bg-slate-900 hover:bg-black text-white text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer font-medium"
                >
                  <Sparkles size={13} className="text-slate-300" />
                  <span>Proceder a la conversión digital</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Immersive Ultra Minimalist Loading Pane with no bright colors */
        <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-xs">
          
          <div className="mb-5">
            <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center bg-slate-50">
              <Loader2 className="animate-spin text-slate-600" size={24} />
            </div>
          </div>

          <h3 className="text-sm font-bold text-slate-800 mb-1">Analizando de forma estructurada</h3>
          
          {/* Dynamic grey rounded bullet micro-status */}
          <div className="bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-full inline-flex items-center gap-2 text-[11px] text-slate-600 mb-5 max-w-sm">
            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-ping shrink-0" />
            <span className="truncate">{CYCLING_MESSAGES[loadMessageIndex]}</span>
          </div>

          <div className="w-full max-w-xs bg-slate-100 rounded-full h-1 overflow-hidden">
            <div className="bg-slate-900 h-1 rounded-full animate-pulse w-3/4 mx-auto" />
          </div>

          <p className="text-[10px] text-slate-400 mt-4 leading-relaxed font-mono max-w-xs">
            Procesando diseño mediante modelos de segmentación neuronal y análisis contextual.
          </p>
        </div>
      )}
    </div>
  );
}
