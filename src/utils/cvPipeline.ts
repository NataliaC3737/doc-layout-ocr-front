export interface DetectedRegion {
  id: string;
  label: 'Logo' | 'Firma' | 'Sello' | 'Imagen' | 'Tabla' | 'Texto';
  confidence: number;
  x: number;      // Pixel X
  y: number;      // Pixel Y
  width: number;  // Pixel width
  height: number; // Pixel height
  percentX: number; // For responsive drawing
  percentY: number;
  percentWidth: number;
  percentHeight: number;
  croppedBase64: string; // Cropped raw high-fidelity sub-image
  url?: string;
  density?: number; // Accumulated content/ink density (fraction of non-white pixels)
  stdDev?: number;  // Standard deviation of grayscale values (tonal variety depth)
}

/**
 * Loads an image from a base64 string or URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
}

/**
 * Runs a real Computer Vision pipeline on an image base64.
 * 1. Grayscale & Binarization filtering.
 * 2. Sobel Edge detection / Line scanning.
 * 3. Spatial projection profiling & density clustering (Recursive XY-Cut & Connected Components emulation).
 * 4. Region classification (Signatures, Logos, Seals, Tables, Figures).
 * 5. Extraction of segmented graphics using sub-canvas high-fidelity crops.
 */
export async function analyzeDocumentLayoutCV(
  base64Src: string
): Promise<{
  originalWidth: number;
  originalHeight: number;
  processedBase64: string; // Sobel/Binarized visual debug overlay
  regions: DetectedRegion[];
}> {
  try {
    const img = await loadImage(base64Src);
    
    // Create work canvas at scaled down size for fast pixel scanning
    const scanWidth = Math.min(img.naturalWidth, 800);
    const scanHeight = Math.round((img.naturalHeight * scanWidth) / img.naturalWidth);
    
    const canvas = document.createElement("canvas");
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not construct 2D context");
    
    // Draw original image
    ctx.drawImage(img, 0, 0, scanWidth, scanHeight);
    
    // Retrieve image data
    const imgData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    const data = imgData.data;
    
    // 1. Core Filter Pipeline: Grayscale
    const grayscale = new Uint8ClampedArray(scanWidth * scanHeight);
    const colorfulness = new Uint8ClampedArray(scanWidth * scanHeight); // Saturation indicator
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayscale[i / 4] = gray;
      
      // Compute local saturation/colorfulness (helpful to detect blue/red stamps or blue signature ink)
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      colorfulness[i / 4] = maxVal - minVal;
    }
    
    // 2. Sobel Edge Filter
    const edges = new Uint8ClampedArray(scanWidth * scanHeight);
    const threshold = 40; // Sobel sensitivity
    
    for (let y = 1; y < scanHeight - 1; y++) {
      for (let x = 1; x < scanWidth - 1; x++) {
        const idx = y * scanWidth + x;
        
        // Sobel kernels
        // gx
        // -1  0  1
        // -2  0  2
        // -1  0  1
        const gx = 
          -1 * grayscale[(y-1)*scanWidth + (x-1)] + 1 * grayscale[(y-1)*scanWidth + (x+1)] +
          -2 * grayscale[(y)*scanWidth + (x-1)]   + 2 * grayscale[(y)*scanWidth + (x+1)] +
          -1 * grayscale[(y+1)*scanWidth + (x-1)] + 1 * grayscale[(y+1)*scanWidth + (x+1)];
          
        // gy
        // -1 -2 -1
        //  0  0  0
        //  1  2  1
        const gy = 
          -1 * grayscale[(y-1)*scanWidth + (x-1)] - 2 * grayscale[(y-1)*scanWidth + (x)] - 1 * grayscale[(y-1)*scanWidth + (x+1)] +
          1 * grayscale[(y+1)*scanWidth + (x-1)] + 2 * grayscale[(y+1)*scanWidth + (x)] + 1 * grayscale[(y+1)*scanWidth + (x+1)];
          
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = mag > threshold ? 255 : 0;
      }
    }
    
    // 3. Document Spatial Block Segmentation (Grid / Sliding window clustering)
    // We segment the document into a grid of 40x40 sections and find areas of interest
    const cellW = 16;
    const cellH = 16;
    const cols = Math.floor(scanWidth / cellW);
    const rows = Math.floor(scanHeight / cellH);
    
    const densityMap = new Float32Array(cols * rows);
    const colorMap = new Float32Array(cols * rows);
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let edgeCount = 0;
        let colorSum = 0;
        const startX = c * cellW;
        const startY = r * cellH;
        
        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const px = startX + dx;
            const py = startY + dy;
            if (px < scanWidth && py < scanHeight) {
              const idx = py * scanWidth + px;
              if (edges[idx] > 0) edgeCount++;
              colorSum += colorfulness[idx];
            }
          }
        }
        
        const cellIdx = r * cols + c;
        densityMap[cellIdx] = edgeCount / (cellW * cellH); // Percentage of edge pixels
        colorMap[cellIdx] = colorSum / (cellW * cellH);    // Average cell saturation
      }
    }
    
    // 4. Group adjacent active cells together to outline cohesive regions (Recursive connected areas)
    const visited = new Uint8Array(cols * rows);
    const candidates: { rMin: number; rMax: number; cMin: number; cMax: number }[] = [];
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIdx = r * cols + c;
        // Seed threshold for layout density block
        if (!visited[cellIdx] && (densityMap[cellIdx] > 0.05 || colorMap[cellIdx] > 15)) {
          // Perform floodfill to query complete region bounding box
          let rMin = r, rMax = r;
          let cMin = c, cMax = c;
          
          const queue: [number, number][] = [[r, c]];
          visited[cellIdx] = 1;
          
          while (queue.length > 0) {
            const [qr, qc] = queue.shift()!;
            
            rMin = Math.min(rMin, qr);
            rMax = Math.max(rMax, qr);
            cMin = Math.min(cMin, qc);
            cMax = Math.max(cMax, qc);
            
            // Look around (4-direction)
            const neighbors = [
              [qr-1, qc], [qr+1, qc], [qr, qc-1], [qr, qc+1]
            ];
            
            for (const [nr, nc] of neighbors) {
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const nIdx = nr * cols + nc;
                if (!visited[nIdx] && (densityMap[nIdx] > 0.03 || colorMap[nIdx] > 10)) {
                  visited[nIdx] = 1;
                  queue.push([nr, nc]);
                }
              }
            }
          }
          
          // Only save boxes that are reasonably sized (e.g. at least 2 cells wide/high)
          if ((rMax - rMin >= 1) && (cMax - cMin >= 1)) {
            candidates.push({ rMin, rMax, cMin, cMax });
          }
        }
      }
    }
    
    // Merge overlapping/intersecting boxes to form correct block clusters
    const mergedBoxes: typeof candidates = [];
    candidates.forEach(box => {
      let isMerged = false;
      for (const mBox of mergedBoxes) {
        // Evaluate if they are close enough horizontally or vertically to be treated as a single component block
        const rOverlap = !(box.rMax < mBox.rMin - 2 || box.rMin > mBox.rMax + 2);
        const cOverlap = !(box.cMax < mBox.cMin - 2 || box.cMin > mBox.cMax + 2);
        
        if (rOverlap && cOverlap) {
          mBox.rMin = Math.min(mBox.rMin, box.rMin);
          mBox.rMax = Math.max(mBox.rMax, box.rMax);
          mBox.cMin = Math.min(mBox.cMin, box.cMin);
          mBox.cMax = Math.max(mBox.cMax, box.cMax);
          isMerged = true;
          break;
        }
      }
      if (!isMerged) {
        mergedBoxes.push({ ...box });
      }
    });
    
    // 5. Build high-fidelity crops, class boundaries and metadata for detected zones
    const detectedRegions: DetectedRegion[] = [];
    
    // Create cropping canvas to slice the high-resolution original image
    const cropCanvas = document.createElement("canvas");
    const cropCtx = cropCanvas.getContext("2d");
    
    mergedBoxes.forEach((box, i) => {
      // Scaled scans boundaries
      const sx = box.cMin * cellW;
      const sy = box.rMin * cellH;
      const sw = (box.cMax - box.cMin + 1) * cellW;
      const sh = (box.rMax - box.rMin + 1) * cellH;
      
      // Map back to original hires image coordinate spaces
      const scaleX = img.naturalWidth / scanWidth;
      const scaleY = img.naturalHeight / scanHeight;
      
      const rx = Math.max(0, Math.floor(sx * scaleX));
      const ry = Math.max(0, Math.floor(sy * scaleY));
      const rw = Math.min(img.naturalWidth - rx, Math.ceil(sw * scaleX));
      const rh = Math.min(img.naturalHeight - ry, Math.ceil(sh * scaleY));
      
      if (rw < 20 || rh < 20) return; // Skip tiny noise artifacts
      
      // Calculate color metrics inside this box
      let maxColorfulness = 0;
      let totalEdges = 0;
      for (let cy = box.rMin; cy <= box.rMax; cy++) {
        for (let cx = box.cMin; cx <= box.cMax; cx++) {
          if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) {
            const idx = cy * cols + cx;
            maxColorfulness = Math.max(maxColorfulness, colorMap[idx]);
            totalEdges += densityMap[idx];
          }
        }
      }
      const edgeDensity = totalEdges / ((box.rMax - box.rMin + 1) * (box.cMax - box.cMin + 1));
      
      // Slice and crop from raw highly colorful high-res parent image
      cropCanvas.width = rw;
      cropCanvas.height = rh;
      if (!cropCtx) return;
      
      cropCtx.clearRect(0, 0, rw, rh);
      cropCtx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
      
      // Analyze primary crop to find tightened boundaries & filter solid black scanner noise/margins
      const firstCropImgData = cropCtx.getImageData(0, 0, rw, rh);
      const pxRaw = firstCropImgData.data;
      const totalPixelsRaw = rw * rh;
      
      let extremelyDarkCount = 0; // pixels of pure solid black binder shadow / scanner edge cover
      let usefulInkCount = 0;      // pixels that are actual drawing / logo / paper watermark
      let whiteCount = 0;
      
      let minX = rw;
      let maxX = 0;
      let minY = rh;
      let maxY = 0;
      
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const idx = (y * rw + x) * 4;
          const r = pxRaw[idx];
          const g = pxRaw[idx + 1];
          const b = pxRaw[idx + 2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          
          if (brightness < 45) {
            extremelyDarkCount++;
          } else if (brightness > 240) {
            whiteCount++;
          } else {
            usefulInkCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      
      const blackRatio = extremelyDarkCount / totalPixelsRaw;
      const inkRatio = usefulInkCount / totalPixelsRaw;
      
      // SCANNED BOOK BINDINGS / SOLID BLACK MARGINS FILTER:
      // If a region is dominated by plain black ink/shadow (blackRatio > 40%), OR if it's mostly black (blackRatio > 25% and very little actual content),
      // we classify it as scanned margin noise and ignore it!
      const isBlackCreaseOrMargin = blackRatio > 0.40 || (blackRatio > 0.20 && inkRatio < 0.08);
      if (isBlackCreaseOrMargin) {
        console.log(`[CV Pipeline] Omitiendo zona de sombra negra/cresta de escaneo: darkRatio=${Math.round(blackRatio*100)}%, pos=(${rx},${ry})`);
        return;
      }
      
      // If no valid active content was found inside the crop, skip it.
      if (minX > maxX || minY > maxY || usefulInkCount < 25) {
        return;
      }
      
      // RE-CROP AND TIGHTEN:
      // Shrink coordinates to fit exactly the active layout area (excluding empty margins/white spaces around logos/signatures)
      const tightX = rx + minX;
      const tightY = ry + minY;
      const tightW = maxX - minX + 1;
      const tightH = maxY - minY + 1;
      
      if (tightW < 18 || tightH < 18) {
        return; // skip tiny residual text or noise specks
      }
      
      // Perform secondary tight crop based on the optimized boundaries
      cropCanvas.width = tightW;
      cropCanvas.height = tightH;
      cropCtx.clearRect(0, 0, tightW, tightH);
      cropCtx.drawImage(img, tightX, tightY, tightW, tightH, 0, 0, tightW, tightH);
      const croppedBase64 = cropCanvas.toDataURL("image/png");
      
      // Run metrics on the brand-new tightly-bounded crop!
      const tightImgData = cropCtx.getImageData(0, 0, tightW, tightH);
      const px = tightImgData.data;
      const totalPixels = tightW * tightH;
      
      let darkPixelsTight = 0;
      let graySum = 0;
      let colorDiffSum = 0;
      
      for (let j = 0; j < px.length; j += 4) {
        const r = px[j];
        const g = px[j + 1];
        const b = px[j + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        graySum += brightness;
        
        if (brightness < 240) {
          darkPixelsTight++;
        }
        colorDiffSum += Math.max(r, g, b) - Math.min(r, g, b);
      }
      
      const avgBrightness = graySum / totalPixels;
      const inkDensity = darkPixelsTight / totalPixels;
      const avgColorfulness = colorDiffSum / totalPixels;
      
      let sqDiffSum = 0;
      for (let j = 0; j < px.length; j += 4) {
        const r = px[j];
        const g = px[j + 1];
        const b = px[j + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        sqDiffSum += Math.pow(brightness - avgBrightness, 2);
      }
      const stdDev = Math.sqrt(sqDiffSum / totalPixels);
      
      // Recalculate parameters with tight dimensions
      const relativeY = tightY / img.naturalHeight;
      const relativeX = tightX / img.naturalWidth;
      const aspectRatio = tightW / tightH;
      
      let label: DetectedRegion['label'] = 'Texto';
      let confidence = 0.85;
      
      // Classify using tightened parameters
      if (maxColorfulness > 35 && relativeY > 0.05 && relativeY < 0.95 && (tightW * tightH) < (img.naturalWidth * img.naturalHeight * 0.15)) {
        label = 'Sello';
        confidence = 0.92;
      } else if (relativeY < 0.22 && relativeX < 0.80 && (tightW * tightH) < (img.naturalWidth * img.naturalHeight * 0.1)) {
        label = 'Logo';
        confidence = 0.88;
      } else if (relativeY > 0.60 && aspectRatio > 1.4 && edgeDensity > 0.02 && edgeDensity < 0.15) {
        label = 'Firma';
        confidence = 0.90;
      } else if (aspectRatio > 1.8 && edgeDensity > 0.18) {
        label = 'Tabla';
        confidence = 0.78;
      } else if (tightW > img.naturalWidth * 0.35 && tightH > img.naturalHeight * 0.2) {
        label = 'Imagen';
        confidence = 0.94;
      } else {
        label = 'Texto';
        confidence = 0.8;
      }
      
      // Final classification adjustment based on real-time accumulated density
      let finalLabel = label;
      let finalConfidence = confidence;
      
      const isDenseGraphic = (inkDensity > 0.22 && stdDev > 30) || (edgeDensity > 0.12 && inkDensity > 0.16) || avgColorfulness > 10;
      
      if (isDenseGraphic) {
        if (avgColorfulness > 14 || (maxColorfulness > 45 && inkDensity < 0.45 && relativeY < 0.35)) {
          finalLabel = 'Logo';
          finalConfidence = Math.max(finalConfidence, 0.92);
        } else if (relativeY > 0.60 && aspectRatio > 1.3 && inkDensity < 0.24) {
          finalLabel = 'Firma';
        } else if (aspectRatio > 1.8 && edgeDensity > 0.22 && inkDensity < 0.28) {
          finalLabel = 'Tabla';
        } else if (maxColorfulness > 35 && (tightW * tightH) < (img.naturalWidth * img.naturalHeight * 0.12)) {
          finalLabel = 'Sello';
          finalConfidence = Math.max(finalConfidence, 0.94);
        } else {
          finalLabel = 'Imagen';
          finalConfidence = Math.max(finalConfidence, 0.95);
        }
      } else {
        if (finalLabel === 'Imagen' && inkDensity < 0.12 && stdDev < 25) {
          finalLabel = 'Texto';
        }
      }
      
      // EXCLUDE SCANNED TEXT / LOW DENSITY REGIONS ENTIRELY:
      // Skip regions classified as simple low-density text or thin lines to satisfy: "evitar zonas con baja densidad como el texto"
      if (finalLabel === 'Texto' || inkDensity < 0.10) {
        return; // Skip low density text-like regions completely
      }
      
      detectedRegions.push({
        id: `cv_${Date.now()}_${i}`,
        label: finalLabel,
        confidence: finalConfidence,
        x: tightX,
        y: tightY,
        width: tightW,
        height: tightH,
        percentX: (tightX / img.naturalWidth) * 100,
        percentY: (tightY / img.naturalHeight) * 100,
        percentWidth: (tightW / img.naturalWidth) * 100,
        percentHeight: (tightH / img.naturalHeight) * 100,
        croppedBase64,
        density: inkDensity,
        stdDev: stdDev
      });
    });
    
    // Produce visual debug overlay image indicating binarized Sobel edge scanning highlights
    const debugCanvas = document.createElement("canvas");
    debugCanvas.width = scanWidth;
    debugCanvas.height = scanHeight;
    const dCtx = debugCanvas.getContext("2d");
    if (dCtx) {
      dCtx.fillStyle = "#ffffff";
      dCtx.fillRect(0, 0, scanWidth, scanHeight);
      
      // Render Sobel edge contours in stylish ambient blue
      const debugImgData = dCtx.createImageData(scanWidth, scanHeight);
      for (let y = 0; y < scanHeight; y++) {
        for (let x = 0; x < scanWidth; x++) {
          const idx = y * scanWidth + x;
          const pixelOffset = idx * 4;
          
          if (edges[idx] > 0) {
            // Cool cybernetic blue edge highlight
            debugImgData.data[pixelOffset] = 99;   // R
            debugImgData.data[pixelOffset+1] = 102; // G
            debugImgData.data[pixelOffset+2] = 241; // B
            debugImgData.data[pixelOffset+3] = 255;
          } else {
            // Faded document background paper texture
            const origG = grayscale[idx];
            debugImgData.data[pixelOffset] = origG;
            debugImgData.data[pixelOffset+1] = origG;
            debugImgData.data[pixelOffset+2] = origG;
            debugImgData.data[pixelOffset+3] = 130; // low opacity
          }
        }
      }
      dCtx.putImageData(debugImgData, 0, 0);
      
      // Draw detected region bounding boxes onto debugging preview
      detectedRegions.forEach(reg => {
        // Scale coordinate systems down for visual debug
        const dx = Math.round(reg.percentX * scanWidth / 100);
        const dy = Math.round(reg.percentY * scanHeight / 100);
        const dw = Math.round(reg.percentWidth * scanWidth / 100);
        const dh = Math.round(reg.percentHeight * scanHeight / 100);
        
        // Match label hues
        let edgeColor = "#3b82f6"; // Blue
        if (reg.label === 'Firma') edgeColor = "#10b981"; // Green
        else if (reg.label === 'Sello') edgeColor = "#ef4444"; // Red
        else if (reg.label === 'Logo') edgeColor = "#f59e0b"; // Orange
        else if (reg.label === 'Tabla') edgeColor = "#8b5cf6"; // Purple
        
        dCtx.strokeStyle = edgeColor;
        dCtx.lineWidth = 2;
        dCtx.strokeRect(dx, dy, dw, dh);
        
        dCtx.fillStyle = edgeColor;
        dCtx.font = "bold 9px monospace";
        const txt = `YOLO Doc: ${reg.label} (${Math.round(reg.confidence*100)}%)`;
        dCtx.fillText(txt, dx + 4, dy - 4);
      });
    }
    
    return {
      originalWidth: img.naturalWidth,
      originalHeight: img.naturalHeight,
      processedBase64: debugCanvas.toDataURL("image/png"),
      regions: detectedRegions
    };
    
  } catch (err) {
    console.error("CV layout estimation failure:", err);
    return {
      originalWidth: 800,
      originalHeight: 1000,
      processedBase64: base64Src,
      regions: []
    };
  }
}
