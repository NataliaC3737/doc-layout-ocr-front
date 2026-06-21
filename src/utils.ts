import { Block, Draft, ResourceFile } from "./types";

/**
 * Parses an HTML string into a list of Notion-style Block objects
 */
export function parseHtmlToBlocks(htmlString: string, resources?: ResourceFile[], cvRegions?: any[]): Block[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const blocks: Block[] = [];

  // Track regions processed to place them accurately in order
  const activeCvRegions = cvRegions ? cvRegions.map(r => ({ ...r, isUsedInDoc: false })) : [];

  // 1. Unwrap all <span> elements to preserve raw text/formatting without any position or styling noise
  const spans = doc.querySelectorAll('span');
  spans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });

  // 2. Remove empty/solitary <br> tags and formatting noise
  const brs = doc.querySelectorAll('br');
  brs.forEach(br => {
    const parent = br.parentNode;
    if (parent) {
      const parentText = parent.textContent || '';
      // If the parent is empty or has no text except whitespace, or br is redundant at start/end
      if (!parentText.trim() || parentText.trim() === '') {
        br.remove();
      }
    }
  });

  // 2b. Elevate standalone <img> tags to be top-level siblings in the body so they are parsed as distinct layout blocks.
  // This guarantees that logos, signatures, and stamps are placed perfectly in the sequence without getting lost.
  // However, we MUST NOT elevate images that reside inside tables (td, th, table) or lists (li) as that would corrupt their spatial cell placement.
  const imgs = doc.querySelectorAll('img');
  imgs.forEach(img => {
    // If the image is in a table structure, do not elevate it so it stays neatly in place.
    if (img.closest('table, td, th, li')) {
      return;
    }

    let ancestor: HTMLElement | null = img.parentElement;
    if (!ancestor) return;
    
    // Bubble up until we hit the direct child of the <body> tag
    while (ancestor && ancestor.parentElement && ancestor.parentElement.tagName.toLowerCase() !== 'body') {
      ancestor = ancestor.parentElement;
    }
    
    if (ancestor && ancestor.parentElement) {
      if (ancestor !== img) {
        ancestor.parentElement.insertBefore(img, ancestor);
      }
    }
  });

  function cleanHtml(html: string): string {
    if (!html) return '';
    let cleaned = html.trim();
    
    // Replace non-breaking spaces and collapse duplicate whitespace
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    
    // Remove any translation/OCR-induced codes (e.g. FA1_26 layout trackers)
    cleaned = cleaned.replace(/FA\d+_\d+/gi, '');

    // Strip ALL html tags to get pure plain text inside the editor areas
    cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, "");

    // Decode HTML entities (like &amp; &lt; &gt; &quot; &#39;)
    const decoder = document.createElement("textarea");
    decoder.innerHTML = cleaned;
    cleaned = decoder.value;

    return cleaned.trim();
  }

  function traverseNodes(parentNode: Node) {
    const childNodes = Array.from(parentNode.childNodes);
    
    childNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          blocks.push({
            id: crypto.randomUUID(),
            type: tagName as 'h1' | 'h2' | 'h3',
            content: cleanHtml(element.innerHTML),
          });
        } else if (tagName === 'p') {
          const textStr = element.textContent || '';
          const cleanText = textStr.trim();
          if (cleanText.startsWith('[x]') || cleanText.startsWith('[X]') || cleanText.startsWith('☑')) {
            blocks.push({
              id: crypto.randomUUID(),
              type: 'todo',
              content: cleanHtml(element.innerHTML.replace(/^\[[xX]\]\s*|^☑\s*/, '')),
              properties: { checked: true }
            });
          } else if (cleanText.startsWith('[ ]') || cleanText.startsWith('☐')) {
            blocks.push({
              id: crypto.randomUUID(),
              type: 'todo',
              content: cleanHtml(element.innerHTML.replace(/^\[\s*\]\s*|^☐\s*/, '')),
              properties: { checked: false }
            });
          } else {
            blocks.push({
              id: crypto.randomUUID(),
              type: 'paragraph',
              content: cleanHtml(element.innerHTML),
            });
          }
        } else if (tagName === 'blockquote') {
          blocks.push({
            id: crypto.randomUUID(),
            type: 'quote',
            content: cleanHtml(element.innerHTML),
          });
        } else if (tagName === 'pre' || tagName === 'code') {
          const codeText = element.textContent || '';
          blocks.push({
            id: crypto.randomUUID(),
            type: 'code',
            content: codeText,
            properties: { language: 'javascript' }
          });
        } else if (tagName === 'ul') {
          Array.from(element.children).forEach(li => {
            const liText = li.textContent || '';
            if (liText.trim().startsWith('[ ]') || liText.trim().startsWith('☐')) {
              blocks.push({
                id: crypto.randomUUID(),
                type: 'todo',
                content: cleanHtml(li.innerHTML.replace(/^\[\s*\]\s*|^☐\s*/, '')),
                properties: { checked: false }
              });
            } else if (liText.trim().startsWith('[x]') || liText.trim().startsWith('☑')) {
              blocks.push({
                id: crypto.randomUUID(),
                type: 'todo',
                content: cleanHtml(li.innerHTML.replace(/^\[[xX]\]\s*|^☑\s*/, '')),
                properties: { checked: true }
              });
            } else {
              blocks.push({
                id: crypto.randomUUID(),
                type: 'bulleted-list',
                content: cleanHtml(li.innerHTML),
              });
            }
          });
        } else if (tagName === 'ol') {
          Array.from(element.children).forEach(li => {
            blocks.push({
              id: crypto.randomUUID(),
              type: 'numbered-list',
              content: cleanHtml(li.innerHTML),
            });
          });
        } else if (tagName === 'table') {
          const rows: string[][] = [];
          const trs = element.querySelectorAll('tr');
          trs.forEach(tr => {
            const rowData: string[] = [];
            const cells = tr.querySelectorAll('th, td');
            cells.forEach(cell => {
              rowData.push(cleanHtml(cell.innerHTML));
            });
            if (rowData.length > 0) {
              rows.push(rowData);
            }
          });
          blocks.push({
            id: crypto.randomUUID(),
            type: 'table',
            content: '',
            properties: { rows: rows.length > 0 ? rows : [['Encabezado 1', 'Encabezado 2'], ['Dato 1', 'Dato 2']] }
          });
        } else if (tagName === 'img') {
          const srcAttr = element.getAttribute('src') || '';
          const altText = (element.getAttribute('alt') || '').toLowerCase();
          let resolvedUrl = '';
          let matched = false;

          const isPdfUrl = (url: string) => {
            if (!url) return false;
            return url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf');
          };

          // 1. If srcAttr is already an uploaded image URL (not a PDF) or valid image data URL, keep it!
          if (srcAttr && (srcAttr.startsWith('data:image/') || srcAttr.includes('/uploads/')) && !isPdfUrl(srcAttr)) {
            resolvedUrl = srcAttr;
            matched = true;
          }

          // 2. Resolve with Computer Vision crops / regions
          if (!matched && activeCvRegions.length > 0) {
            let targetLabel: string | null = null;
            if (altText.includes('firma') || altText.includes('signature') || altText.includes('firmar')) {
              targetLabel = 'Firma';
            } else if (altText.includes('sello') || altText.includes('stamp') || altText.includes('seal') || altText.includes('sellar')) {
              targetLabel = 'Sello';
            } else if (altText.includes('logo') || altText.includes('logotipo')) {
              targetLabel = 'Logo';
            } else if (altText.includes('imagen') || altText.includes('figura') || altText.includes('grafico') || altText.includes('gráfico')) {
              targetLabel = 'Imagen';
            }

            let matchedRegion = null;
            if (targetLabel) {
              matchedRegion = activeCvRegions.find(r => r.label === targetLabel && !r.isUsedInDoc);
            }

            if (!matchedRegion && (altText.includes('recorte') || altText.includes('crop') || altText.includes('cv_') || srcAttr.includes('crop') || targetLabel)) {
              matchedRegion = activeCvRegions.find(r => r.label !== 'Texto' && r.label !== 'Tabla' && !r.isUsedInDoc);
            }

            if (!matchedRegion) {
              matchedRegion = activeCvRegions.find(r => r.label !== 'Texto' && r.label !== 'Tabla' && !r.isUsedInDoc);
            }

            if (matchedRegion) {
              resolvedUrl = matchedRegion.croppedBase64;
              matchedRegion.isUsedInDoc = true;
              matched = true;
            }
          }

          // 3. Resolve against uploaded resources that are images, by filename
          if (!matched && resources && resources.length > 0) {
            const matchedResourceByName = resources.find(r => 
              r.type.startsWith('image/') && !isPdfUrl(r.base64 || r.url || '') && 
              (r.name.toLowerCase() === srcAttr.toLowerCase() ||
               srcAttr.toLowerCase().endsWith(r.name.toLowerCase()) ||
               r.name.toLowerCase().endsWith(srcAttr.toLowerCase()))
            );
            if (matchedResourceByName) {
              resolvedUrl = matchedResourceByName.url || matchedResourceByName.base64 || '';
              matched = true;
            }
          }

          // 4. Resolve against index references ONLY if the referenced resource is a valid image (NOT a PDF)
          if (!matched && resources && resources.length > 0) {
            const originalMatch = srcAttr.match(/ORIGINAL_IMAGE_(\d+)/i);
            const numMatch = srcAttr.match(/\d+/);
            
            let idx: number | null = null;
            if (originalMatch) {
              idx = parseInt(originalMatch[1], 10);
            } else if (numMatch) {
              idx = parseInt(numMatch[0], 10);
            }

            if (idx !== null && resources[idx]) {
              const resCandidate = resources[idx];
              if (resCandidate && resCandidate.type.startsWith('image/') && !isPdfUrl(resCandidate.base64 || resCandidate.url || '')) {
                resolvedUrl = resCandidate.url || resCandidate.base64 || '';
                matched = true;
              }
            }
          }

          // 5. Absolute fallback: use the first image/crop resource (NOT a PDF)
          if (!matched && resources && resources.length > 0) {
            const firstPic = resources.find(r => r.type.startsWith('image/') && !isPdfUrl(r.base64 || r.url || ''));
            if (firstPic) {
              resolvedUrl = firstPic.url || firstPic.base64 || '';
              matched = true;
            }
          }

          if (isPdfUrl(resolvedUrl)) {
            resolvedUrl = ''; 
          }

          if (resolvedUrl) {
            blocks.push({
              id: crypto.randomUUID(),
              type: 'image',
              content: element.getAttribute('alt') || 'Imagen original',
              properties: { imageUrl: resolvedUrl }
            });
          }
        } else {
          // If the element is some unknown layout container (like div, section, article, details, main, form),
          // traverse its child nodes recursively so that any nested content is fully parsed and never omitted!
          if (element.childNodes.length > 0) {
            traverseNodes(element);
          } else {
            const txt = element.textContent?.trim();
            if (txt) {
              blocks.push({
                id: crypto.randomUUID(),
                type: 'paragraph',
                content: cleanHtml(element.innerHTML),
              });
            }
          }
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        // Direct text nodes inside containers are captured as standard text blocks
        const txt = node.textContent?.trim();
        if (txt) {
          blocks.push({
            id: crypto.randomUUID(),
            type: 'paragraph',
            content: cleanHtml(node.textContent || ''),
          });
        }
      }
    });
  }

  // Parse all child nodes of original DOM body recursively
  traverseNodes(doc.body);

  // Filter out blocks that have absolutely no textual or visual content (e.g. paragraphs containing only empty tags or spaces)
  // Also filter out any blocks that contain redundant "Doc Digitalizado", "Documento Digitalizado", "Documento original cargado" headers or paragraphs
  let cleanedBlocks = blocks.filter(b => {
    const textContent = b.content.replace(/<[^>]*>/g, '').trim();
    if (
      textContent.includes("Doc Digitalizado") || 
      textContent.includes("Documento Digitalizado") || 
      textContent.includes("Documento original cargado") ||
      textContent.includes("Documento cargado")
    ) {
      return false;
    }

    if (b.type === 'paragraph' || b.type === 'bulleted-list' || b.type === 'numbered-list' || b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'quote') {
      const plainContent = b.content.replace(/<[^>]*>/g, '').trim();
      return plainContent !== '';
    }
    // Always keep tables and images as they are visual blocks
    return true;
  });

  // Return standard paragraph fallback if empty
  if (cleanedBlocks.length === 0) {
    cleanedBlocks.push({
      id: crypto.randomUUID(),
      type: 'paragraph',
      content: 'Comienza a escribir aquí...',
    });
  }

  // 3. Insert any remaining high-confidence CV graphics (Logos, Seals, Signatures) that Gemini missed or omitted
  if (activeCvRegions.length > 0) {
    const unusedRegions = activeCvRegions.filter(r => !r.isUsedInDoc).sort((a, b) => a.percentY - b.percentY);
    unusedRegions.forEach(reg => {
      if (reg.label === 'Texto' || reg.label === 'Tabla') return; // Only process distinctive visual graphic segments
      
      const newBlock: Block = {
        id: reg.id || crypto.randomUUID(),
        type: 'image',
        content: `Segmento de Documento (${reg.label} Reconstruido)`,
        properties: { imageUrl: reg.croppedBase64 }
      };
      
      if (reg.label === 'Logo' || reg.percentY < 15) {
        cleanedBlocks.unshift(newBlock);
      } else if (reg.label === 'Firma' || reg.percentY > 80) {
        cleanedBlocks.push(newBlock);
      } else {
        const targetIdx = Math.max(0, Math.min(cleanedBlocks.length, Math.floor((reg.percentY / 100) * cleanedBlocks.length)));
        cleanedBlocks.splice(targetIdx, 0, newBlock);
      }
      reg.isUsedInDoc = true;
    });
  }

  // Centrally resolve any remaining ORIGINAL_IMAGE_X references inside block content or table cell properties
  if (resources && resources.length > 0) {
    cleanedBlocks.forEach(block => {
      if (block.type === 'table' && block.properties?.rows) {
        block.properties.rows = block.properties.rows.map(row => 
          row.map(cell => 
            cell.replace(/(src=)?["']?ORIGINAL_IMAGE_(\d+)["']?/gi, (match, srcPart, p2) => {
              const idx = parseInt(p2, 10);
              const targetRes = (resources[idx] && resources[idx].base64) ? resources[idx] : resources.find(r => r.base64);
              if (targetRes && targetRes.base64) {
                return srcPart ? `src="${targetRes.base64}"` : targetRes.base64;
              }
              return match;
            })
          )
        );
      } else if (block.content) {
        block.content = block.content.replace(/(src=)?["']?ORIGINAL_IMAGE_(\d+)["']?/gi, (match, srcPart, p2) => {
          const idx = parseInt(p2, 10);
          const targetRes = (resources[idx] && resources[idx].base64) ? resources[idx] : resources.find(r => r.base64);
          if (targetRes && targetRes.base64) {
            return srcPart ? `src="${targetRes.base64}"` : targetRes.base64;
          }
          return match;
        });
      }
    });
  }

  return cleanedBlocks;
}

/**
 * Exports blocks array to structured HTML markup
 */
export function exportBlocksToHtml(blocks: Block[]): string {
  let html = '';
  let inList: 'ul' | 'ol' | null = null;

  function cleanText(text: string): string {
    if (!text) return '';
    let t = text;
    // Strip trailing or starting br
    t = t.replace(/^(<br\s*\/?>\s*)+/gi, '');
    t = t.replace(/(<br\s*\/?>\s*)+$/gi, '');
    // Replace span elements like <span style="margin-left: 20px;">1</span>, unwrapping their text value safely
    t = t.replace(/<span[^>]*style="[^"]*margin-left:[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, ' $1 ');
    t = t.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    // Remove pattern FA1_26 or similar leftovers if they are translation noise
    t = t.replace(/FA\d+_\d+/gi, '');
    return t.trim();
  }

  blocks.forEach(block => {
    // Check if we need to close consecutive list scopes
    if (inList === 'ul' && block.type !== 'bulleted-list') {
      html += '</ul>\n';
      inList = null;
    } else if (inList === 'ol' && block.type !== 'numbered-list') {
      html += '</ol>\n';
      inList = null;
    }

    const cleanContent = cleanText(block.content);

    // Skip empty lines in exported outputs to keep formatting dense and pristine
    if (block.type === 'paragraph' && !cleanContent) {
      return; 
    }

    switch (block.type) {
      case 'h1':
        html += `<h1>${cleanContent}</h1>\n`;
        break;
      case 'h2':
        html += `<h2>${cleanContent}</h2>\n`;
        break;
      case 'h3':
        html += `<h3>${cleanContent}</h3>\n`;
        break;
      case 'paragraph':
        html += `<p>${cleanContent}</p>\n`;
        break;
      case 'quote':
        html += `<blockquote>${cleanContent}</blockquote>\n`;
        break;
      case 'bulleted-list':
        if (!inList) {
          html += '<ul>\n';
          inList = 'ul';
        }
        html += `  <li>${cleanContent}</li>\n`;
        break;
      case 'numbered-list':
        if (!inList) {
          html += '<ol>\n';
          inList = 'ol';
        }
        html += `  <li>${cleanContent}</li>\n`;
        break;
      case 'todo':
        const checkedStr = block.properties?.checked ? '[x]' : '[ ]';
        html += `<p>${checkedStr} ${cleanContent}</p>\n`;
        break;
      case 'code':
        html += `<pre><code class="language-${block.properties?.language || 'javascript'}">${block.content}</code></pre>\n`;
        break;
      case 'table':
        if (block.properties?.rows) {
          html += '<table style="width:100%; border-collapse: collapse; margin: 16px 0;">\n';
          block.properties.rows.forEach((row, rIdx) => {
            html += '  <tr>\n';
            row.forEach(cell => {
              const tag = rIdx === 0 ? 'th' : 'td';
              const style = rIdx === 0 
                ? 'border: 1px solid #e2e8f0; padding: 10px; background-color: #f8fafc; text-align: left; font-weight: 600;'
                : 'border: 1px solid #e2e8f0; padding: 10px; text-align: left;';
              html += `    <${tag} style="${style}">${cleanText(cell)}</${tag}>\n`;
            });
            html += '  </tr>\n';
          });
          html += '</table>\n';
        }
        break;
      case 'image':
        html += `<img src="${block.properties?.imageUrl || ''}" alt="${cleanText(block.content)}" style="max-width: 100%; border-radius: 8px; margin: 16px 0;" />\n`;
        break;
    }
  });

  if (inList === 'ul') html += '</ul>\n';
  if (inList === 'ol') html += '</ol>\n';

  return html;
}

/**
 * Exports blocks array to standard Markdown text
 */
export function exportBlocksToMarkdown(blocks: Block[]): string {
  let md = '';
  let listIndex = 1;

  function stripTags(htmlStr: string): string {
    return htmlStr
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  blocks.forEach((block, index) => {
    const prevBlock = index > 0 ? blocks[index - 1] : null;
    
    switch (block.type) {
      case 'h1':
        md += `# ${stripTags(block.content)}\n\n`;
        break;
      case 'h2':
        md += `## ${stripTags(block.content)}\n\n`;
        break;
      case 'h3':
        md += `### ${stripTags(block.content)}\n\n`;
        break;
      case 'paragraph':
        md += `${stripTags(block.content)}\n\n`;
        break;
      case 'quote':
        md += `> ${stripTags(block.content)}\n\n`;
        break;
      case 'bulleted-list':
        md += `- ${stripTags(block.content)}\n`;
        const nextBlock = index < blocks.length - 1 ? blocks[index + 1] : null;
        if (!nextBlock || nextBlock.type !== 'bulleted-list') {
          md += '\n';
        }
        break;
      case 'numbered-list':
        if (!prevBlock || prevBlock.type !== 'numbered-list') {
          listIndex = 1;
        }
        md += `${listIndex}. ${stripTags(block.content)}\n`;
        listIndex++;
        const nextNumBlock = index < blocks.length - 1 ? blocks[index + 1] : null;
        if (!nextNumBlock || nextNumBlock.type !== 'numbered-list') {
          md += '\n';
        }
        break;
      case 'todo':
        const checked = block.properties?.checked ? '[x]' : '[ ]';
        md += `- ${checked} ${stripTags(block.content)}\n`;
        const nextTodoBlock = index < blocks.length - 1 ? blocks[index + 1] : null;
        if (!nextTodoBlock || nextTodoBlock.type !== 'todo') {
          md += '\n';
        }
        break;
      case 'code':
        md += `\`\`\`${block.properties?.language || 'javascript'}\n${block.content}\n\`\`\`\n\n`;
        break;
      case 'table':
        if (block.properties?.rows && block.properties.rows.length > 0) {
          const rows = block.properties.rows;
          // Headers
          md += '| ' + rows[0].map(cell => stripTags(cell)).join(' | ') + ' |\n';
          // Seperator rule
          md += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
          // Body data
          for (let r = 1; r < rows.length; r++) {
            md += '| ' + rows[r].map(cell => stripTags(cell)).join(' | ') + ' |\n';
          }
          md += '\n';
        }
        break;
      case 'image':
        md += `![${stripTags(block.content)}](${block.properties?.imageUrl || ''})\n\n`;
        break;
    }
  });
  return md;
}

/**
 * LocalStorage sync manager for OCR Document drafts
 */
const STORAGE_KEY = 'notion_ocr_drafts';

export function getLocalDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error reading localStorage drafts:", err);
    return [];
  }
}

export function saveLocalDrafts(drafts: Draft[]): void {
  try {
    // Strip heavy base64 (>800KB) strings from drafts list to prevent localStorage QuotaExceededException
    // Our web-optimized JPEGs are compressed on-upload to stay under ~150KB, so they are always fully preserved.
    const trimmedDrafts = drafts.map(draft => ({
      ...draft,
      resources: draft.resources?.map(res => ({
        name: res.name,
        type: res.type,
        size: res.size,
        base64: res.base64 && res.base64.length > 800000 ? "" : res.base64
      })) || [],
      blocks: draft.blocks?.map(block => {
        if (block.type === 'image' && block.properties?.imageUrl && block.properties.imageUrl.length > 800000) {
          return {
            ...block,
            properties: {
              ...block.properties,
              imageUrl: ""
            }
          };
        }
        return block;
      }) || []
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedDrafts));
  } catch (err) {
    console.error("Error saving drafts to localStorage:", err);
  }
}

/**
 * Triggers a standard file download onto the user's browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (content.startsWith('http') || content.startsWith('/') || content.startsWith('blob:') || content.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = content;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format files bytes cleanly
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Simple IndexedDB helper for drafts to avoid localStorage size limits (base64 pictures can be huge!)
const DB_NAME = 'NotionOcrDb';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getDbDrafts(): Promise<Draft[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result as Draft[];
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB error:", err);
    return [];
  }
}

export async function saveDbDraft(draft: Draft): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(draft);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB save error:", err);
  }
}

export async function deleteDbDraft(id: string): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB delete error:", err);
  }
}

export async function clearDbDrafts(): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB clear error:", err);
  }
}

/**
 * Returns a complete, beautiful HTML string optimal for PDF printing, with styles.
 */
export function exportToPrintableHtml(title: string, blocks: Block[]): string {
  const blocksHtml = exportBlocksToHtml(blocks);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', sans-serif;
      color: #37352f;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1 {
      font-size: 2.5em;
      font-weight: 700;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 1.8em;
      font-weight: 600;
      margin-top: 30px;
      margin-bottom: 10px;
    }
    h3 {
      font-size: 1.4em;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 8px;
    }
    p {
      margin-top: 8px;
      margin-bottom: 8px;
    }
    blockquote {
      border-left: 4px solid #37352f;
      padding-left: 16px;
      font-style: italic;
      color: #64748b;
      margin: 16px 0;
    }
    ul, ol {
      margin: 12px 0 12px 24px;
    }
    li {
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px;
      text-align: left;
    }
    th {
      background-color: #f8fafc;
      font-weight: 600;
    }
    img {
      max-width: 100%;
      border-radius: 8px;
      margin: 20px 0;
      display: block;
    }
    pre {
      background-color: #f4f4f3;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }
    @media print {
      body {
        margin: 20px;
      }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <hr style="border: 0; border-top: 1px solid #ececeb; margin-bottom: 30px;" />
  ${blocksHtml}
</body>
</html>`;
}
