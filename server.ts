import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set body limits higher for large file uploads (PDFs, images)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize Gemini API Client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV, hasApiKey: !!apiKey });
  });

  // OCR and Document Structure Extractor using Enterprise YOLO & Gemini Layout API
  app.post("/api/ocr", async (req, res) => {
    try {
      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "No se proporcionaron archivos para procesamiento." });
      }

      console.log(`[Express Proxy] Recibidos ${files.length} archivos para procesar mediante la API de Diseño YOLO/Gemini.`);

      let combinedHtml = "";
      
      for (const file of files) {
        let base64Data = file.base64;
        if (base64Data.includes(";base64,")) {
          base64Data = base64Data.split(";base64,").pop() || "";
        }
        
        // Convert to Buffer and Blob
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: file.type });
        
        // Create FormData and append file
        const formData = new FormData();
        formData.append("file", blob, file.name);

        console.log(`[Express Proxy] Enviando ${file.name} (${buffer.length} bytes) a la API de maquetación externa...`);
        
        const apiResponse = await fetch("https://doc-layout-ocr-api-585606625670.europe-southwest1.run.app/api/v1/convert-to-html", {
          method: "POST",
          body: formData,
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          throw new Error(`La API de Layout externa respondió con error: ${apiResponse.status} - ${errText}`);
        }

        const htmlResult = await apiResponse.text();
        console.log(`[Express Proxy] Recibido HTML estructurado de la API externa (${htmlResult.length} bytes).`);

        if (combinedHtml) {
          combinedHtml += `<hr style="border-top: 2px dashed #e2e8f0; margin: 40px 0;" />`;
        }
        combinedHtml += htmlResult;
      }

      return res.json({
        html: combinedHtml,
        modelUsed: "YOLO Segmenter + Multimodal Gemini API"
      });
    } catch (error: any) {
      console.error("Error en proxy de OCR:", error);
      return res.status(500).json({ error: error.message || "Error al procesar el documento con la API de Layout." });
    }
  });

  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Serve static uploads
  app.use('/uploads', express.static(uploadDir));

  // Upload image API endpoint
  app.post("/api/upload-image", (req, res) => {
    try {
      const { base64, filename } = req.body;
      if (!base64) {
        return res.status(400).json({ error: "Falta el contenido base64." });
      }

      let base64Data = base64;
      let extension = "png";
      if (base64.includes(";base64,")) {
        const parts = base64.split(";base64,");
        base64Data = parts[1];
        const match = parts[0].match(/data:(image|application|text)\/([a-zA-Z0-9+.-]+)/);
        if (match) {
          extension = match[2];
          if (extension === "jpeg") extension = "jpg";
        }
      }

      const buffer = Buffer.from(base64Data, "base64");
      const uniqueId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const safeFilename = filename 
        ? filename.replace(/[^a-zA-Z0-9.-]/g, "_") 
        : `file_${uniqueId}.${extension}`;
      const storedName = `${uniqueId}_${safeFilename}`;
      const filePath = path.join(uploadDir, storedName);

      fs.writeFileSync(filePath, buffer);

      console.log(`[Storage API] Archivo guardado en disco: ${storedName} (${buffer.length} bytes).`);
      return res.json({ url: `/uploads/${storedName}` });
    } catch (error: any) {
      console.error("[Storage API] Error al guardar archivo:", error);
      return res.status(500).json({ error: error.message || "No se pudo guardar el archivo en el servidor." });
    }
  });

  // Vite development / production middleware routing
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor Express corriendo en el puerto ${PORT}`);
  });
}

startServer();
