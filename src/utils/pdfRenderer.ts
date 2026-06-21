/**
 * PDF Renderer Helper using PDF.js
 * Renders PDF pages to high-resolution JPEG images in the browser.
 */

export async function convertPdfToImages(base64OrUrl: string): Promise<string[]> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) {
    console.error("[PDF Renderer] PDF.js library is not loaded on window.");
    return [];
  }

  try {
    let loadingTask;
    if (base64OrUrl.startsWith("data:application/pdf") || base64OrUrl.includes(";base64,")) {
      const b64Data = base64OrUrl.split(";base64,").pop() || "";
      const binStr = atob(b64Data);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      loadingTask = pdfjsLib.getDocument({ data: bytes });
    } else {
      loadingTask = pdfjsLib.getDocument(base64OrUrl);
    }

    const pdf = await loadingTask.promise;
    const images: string[] = [];
    
    // Process pages up to 5 to avoid browser tab stutter or memory exhaustion
    const pageCount = Math.min(pdf.numPages, 5); 
    console.log(`[PDF Renderer] Cargando PDF con exit: ${pdf.numPages} páginas totales. Renderizando ${pageCount} primeras páginas viales.`);
    
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // 1.8x scale offers prime balance between pixel readability and memory
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Render on canvas
        await page.render({ canvasContext: ctx, viewport }).promise;
        const pageBase64 = canvas.toDataURL("image/jpeg", 0.78);
        images.push(pageBase64);
      }
    }
    return images;
  } catch (error) {
    console.error("[PDF Renderer] Error al renderizar PDF a imágenes:", error);
    return [];
  }
}
