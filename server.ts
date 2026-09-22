import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer } from "ws";
import http from "http";

const PORT = 3000;

function ensureNginxWebSocketPass() {
  const luaPath = "/etc/nginx/user_auth_verification.lua";
  try {
    if (fs.existsSync(luaPath)) {
      let content = fs.readFileSync(luaPath, "utf-8");
      if (!content.includes('ngx.var.uri == "/live"')) {
        const target = 'if ngx.var.host == "localhost" then\n  return\nend';
        const replacement = 'if ngx.var.host == "localhost" or ngx.var.uri == "/live" or (ngx.var.http_upgrade and string.lower(ngx.var.http_upgrade) == "websocket") then\n  return\nend';
        if (content.includes(target)) {
          content = content.replace(target, replacement);
          fs.writeFileSync(luaPath, content, "utf-8");
          exec("nginx -s reload", () => {});
        }
      }
    }
  } catch (err) {
    // Non-blocking in non-container/dev environments
  }
}

async function startServer() {
  ensureNginxWebSocketPass();
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  // Gemini Client initialization
  let ai: GoogleGenAI;
  const getAiInstance = () => {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API_KEY is not set.");
      }
      ai = new GoogleGenAI({ 
        apiKey: apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });
    }
    return ai;
  };

  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
  ] as any[];

  const isRateLimitError = (err: any): boolean => {
    const status = err?.status || err?.code || err?.error?.code;
    const msg = typeof err?.message === "string" ? err.message : JSON.stringify(err || "");
    return status === 429 || status === 503 || status === "RESOURCE_EXHAUSTED" || msg.includes("quota") || msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("demand");
  };

  // Helper for resilient generation with fallback for high demand (503/429)
  const generateWithFallback = async (params: {
    contents: any;
    config?: any;
    models?: string[];
  }) => {
    const aiInstance = getAiInstance();
    const candidateModels = params.models || ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
    let lastError: any = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const response = await aiInstance.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.code || err?.error?.code;
        const isTemporary = status === 503 || status === 429 || status === 404 || isRateLimitError(err) || err?.message?.includes("demand");
        if (!isTemporary && i === candidateModels.length - 1) {
          throw err;
        }
        if (i < candidateModels.length - 1) {
          await new Promise(res => setTimeout(res, 500));
        }
      }
    }
    throw lastError;
  };

  // Helper to extract the most relevant snippet/blurb from a document
  const extractRelevantBlurb = (content: string, query: string, response: string): string => {
    if (!content) return "";
    const cleanContent = content.trim();
    if (cleanContent.length <= 350) return cleanContent;

    // Split content into paragraphs
    const paragraphs = cleanContent.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
    if (paragraphs.length === 0) return cleanContent.substring(0, 350) + "...";

    // Extract significant keywords from query and response
    const words = `${query} ${response}`
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['what', 'when', 'where', 'which', 'about', 'document', 'documents', 'these', 'those', 'their', 'there'].includes(w));

    let bestParagraph = paragraphs[0];
    let highestScore = 0;

    for (const para of paragraphs) {
      const lowerPara = para.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (lowerPara.includes(word)) score += 1;
      }
      if (score > highestScore) {
        highestScore = score;
        bestParagraph = para;
      }
    }

    if (bestParagraph.length > 450) {
      return bestParagraph.substring(0, 420) + "...";
    }
    return bestParagraph;
  };

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, files, systemPersona, chatHistory, userPersona } = req.body;
      
      let baseInstruction = systemPersona || "You are an expert RAG knowledge base assistant with persistent AI Persona memory.";
      if (userPersona) {
        baseInstruction += `\n\n[USER PERSONA / BACKGROUND CONTEXT]:\n${userPersona}`;
      }

      let fullPrompt = "";
      const validFiles = Array.isArray(files) ? files : [];
      const history = Array.isArray(chatHistory) ? chatHistory : [];

      if (history.length > 0) {
        // Include recent timestamped chat turns for persona persistence and memory
        const recentHistory = history.slice(-20); // Last 20 messages for context window efficiency
        const historyText = recentHistory.map((msg: any) => {
          const sender = msg.sender === 'user' ? 'User' : (msg.sender === 'model' ? 'Assistant' : 'System');
          const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
          return `[${time}] ${sender}: ${msg.text}`;
        }).join('\n');
        fullPrompt += `[CONVERSATION HISTORY & PERSISTENCE]:\n${historyText}\n\n`;
      }

      if (validFiles.length > 0) {
        const fileNames = validFiles.map((f: any, idx: number) => `${idx + 1}. ${f.name}`).join("\n");
        baseInstruction += `\n\nYou currently have access to ${validFiles.length} active documents in focus:\n${fileNames}\n\nGround your answers in these active documents and reference specific document names where applicable.`;

        // Allocate budget across all files
        const MAX_TOTAL_CHARS = 80000;
        const maxPerFile = Math.max(3000, Math.floor(MAX_TOTAL_CHARS / validFiles.length));
        const fileContents = validFiles.map((f: any) => {
          const raw = f.content || "";
          const truncated = raw.length > maxPerFile ? raw.substring(0, maxPerFile) + "\n...[truncated for length]" : raw;
          return `=== DOCUMENT: ${f.name} ===\n${truncated}`;
        }).join('\n\n');

        fullPrompt += `[DOCUMENTS IN FOCUS (${validFiles.length} files)]:\n${fileContents}\n\n`;
      }

      fullPrompt += `[CURRENT USER QUERY]:\n${prompt}`;

      const response = await generateWithFallback({
        contents: fullPrompt,
        config: { 
          safetySettings,
          systemInstruction: { parts: [{ text: baseInstruction }] }
        },
      });
      
      const responseText = 
        response.text || 
        response.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") || 
        "I've analyzed the active documents in focus, but found no conclusive answer for this specific query. Please try rephrasing or checking if the relevant document is selected.";

      // Determine citations and parse urlContextMetadata
      const citations: any[] = [];
      const urlContextMetadata: any[] = [];

      // Check if Gemini returned groundingMetadata or search chunks
      const candidate = response.candidates?.[0];
      if (candidate?.groundingMetadata) {
        const gm = candidate.groundingMetadata as any;
        if (Array.isArray(gm.groundingChunks)) {
          gm.groundingChunks.forEach((chunk: any, idx: number) => {
            if (chunk.web?.uri) {
              urlContextMetadata.push({
                retrievedUrl: chunk.web.uri,
                urlRetrievalStatus: 'SUCCESS',
                title: chunk.web.title || `Source ${idx + 1}`,
                snippet: chunk.web.snippet || '',
              });
            }
          });
        }
      }

      if (validFiles.length > 0) {
        // Find which files were directly mentioned or most relevant to the response
        const lowerResponse = responseText.toLowerCase();
        const lowerPrompt = (prompt || "").toLowerCase();

        const scoredFiles = validFiles.map((file: any) => {
          let score = 0;
          const fileNameLower = file.name.toLowerCase();
          const baseName = fileNameLower.replace(/\.[^/.]+$/, "");
          
          if (lowerResponse.includes(fileNameLower) || lowerResponse.includes(baseName)) {
            score += 10;
          }
          if (lowerPrompt.includes(fileNameLower) || lowerPrompt.includes(baseName)) {
            score += 5;
          }

          // Keyword overlap with file content
          const snippet = extractRelevantBlurb(file.content || "", prompt, responseText);
          const sample = (file.content || "").substring(0, 3000).toLowerCase();
          const keywords = prompt.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          keywords.forEach((k: string) => {
            if (sample.includes(k)) score += 1;
          });

          return { file, score, snippet };
        });

        // Filter and sort matching files
        const relevantFiles = scoredFiles
          .filter(sf => sf.score > 0 || scoredFiles.length <= 3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);

        relevantFiles.forEach((rf, idx) => {
          citations.push({
            id: idx + 1,
            fileName: rf.file.name,
            snippet: rf.snippet,
            title: rf.file.name,
          });
        });
      }

      res.json({ text: responseText, citations, urlContextMetadata });
    } catch (e: any) {
      if (isRateLimitError(e)) {
        console.warn("Gemini token quota/rate limit reached on /generate");
        return res.status(429).json({ 
          error: "Rate limit reached. Please wait a few seconds before asking another question." 
        });
      }
      console.warn("Gemini generate error:", e?.message || e);
      res.status(500).json({ error: e?.message || "Generation failed" });
    }
  });

  app.post("/api/gemini/suggestions", async (req, res) => {
    try {
      const { files } = req.body;
      
      if (!files || files.length === 0) {
        return res.json({ text: JSON.stringify({ suggestions: ["Add or focus some files to get topic suggestions."] }) });
      }

      const fileContents = files.map((f: any) => `--- File: ${f.name} ---\n${(f.content || "").substring(0, 2500)}`).join('\n\n');
      const promptText = `Based on the content of the following ${files.length} active documents, provide 3-4 concise and actionable questions a developer or researcher might ask to explore these documents. Return ONLY a JSON object with a key "suggestions" containing an array of strings. Example: {"suggestions": ["What are the core concepts?", "Summarize the key requirements", "How does authentication work?"]}

Documents in focus:
${fileContents}`;

      const response = await generateWithFallback({
        contents: promptText,
        config: {
          safetySettings,
          responseMimeType: "application/json",
        },
      });
      
      const suggestionsText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      res.json({ text: suggestionsText });
    } catch (e: any) {
      if (isRateLimitError(e)) {
        console.warn("Gemini rate limit reached on /suggestions, using fallback suggestions");
        return res.json({ 
          text: JSON.stringify({ 
            suggestions: [
              "Summarize the key information in these files.",
              "What are the main topics covered?",
              "Explain the core concepts and architecture."
            ] 
          }) 
        });
      }
      console.warn("Gemini suggestions error:", e?.message || e);
      res.status(500).json({ error: e?.message || "Failed to fetch suggestions" });
    }
  });

  app.post("/api/gemini/summarize", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.json({ title: "New Chat" });
      }

      const promptText = `Summarize the following chat conversation into a short, concise title (maximum 4-5 words). Do not include quotes or extra punctuation.
      
Conversation:
${text.substring(0, 3000)}`;

      const response = await generateWithFallback({
        contents: promptText,
        config: { safetySettings },
      });
      
      res.json({ title: response.text?.trim() || "New Chat" });
    } catch (e: any) {
      if (isRateLimitError(e)) {
        console.warn("Gemini rate limit reached on /summarize, using default title");
        return res.json({ title: "Chat Conversation" });
      }
      console.warn("Gemini summarize error:", e?.message || e);
      res.status(500).json({ error: e?.message || "Failed to summarize" });
    }
  });

  app.post("/api/gemini/tts", async (req, res) => {
    try {
      const aiInstance = getAiInstance();
      const { text, voice } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const voiceName = voice || 'Aoede';
      const candidateModels = ["gemini-3.1-flash-tts-preview"];
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          const response = await aiInstance.models.generateContent({
            model,
            contents: [{ parts: [{ text: text.substring(0, 1500) }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName },
                },
              },
            },
          });

          const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          const base64Audio = inlineData?.data;
          const mimeType = inlineData?.mimeType || 'audio/mp3';

          if (base64Audio) {
            return res.json({ audio: base64Audio, mimeType });
          }
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError || new Error("No audio generated from candidate models");
    } catch (e: any) {
      if (isRateLimitError(e)) {
        console.warn("Gemini rate limit reached on /tts");
        return res.status(429).json({ error: "Audio generation rate limit reached. Please try again in a few seconds." });
      }
      console.warn("Gemini TTS error:", e?.message || e);
      res.status(500).json({ error: e?.message || "TTS generation failed" });
    }
  });

  // Explicit 404 & error handlers for API routes so they never return HTML
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api")) {
      console.error("API Error Middleware caught:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
    next(err);
  });

  // WebSocket for Live API
  wss.on("connection", async (clientWs, req) => {
    let session: any = null;

    clientWs.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "ping") {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "pong" }));
          }
          return;
        }
        
        if (msg.type === "setup") {
          const aiInstance = getAiInstance();
          const files = msg.files || [];
          const voiceName = msg.voice || "Aoede";
          let systemInstruction = msg.systemPersona || "You are an intelligent, articulate, helpful RAG voice assistant.";
          systemInstruction += "\nYou converse naturally, concisely, and helpfully in spoken audio dialogue. You answer questions using the active documents in focus and general knowledge.";
          
          if (files.length > 0) {
            const fileSummary = files.map((f: any, idx: number) => {
              const preview = (f.content || "").substring(0, 1500);
              return `[Document ${idx + 1}: ${f.name}]\n${preview}`;
            }).join("\n\n");
            systemInstruction += `\n\nActive documents currently in focus (${files.length} documents):\n${fileSummary.substring(0, 32000)}\n\nAnswer user questions accurately based on these documents.`;
          } else {
            systemInstruction += `\n\nNo documents are currently in focus. Answer general questions helpfully and let the user know they can focus documents for grounded Q&A.`;
          }
          
          try {
            session = await aiInstance.live.connect({
              model: "gemini-3.8-live",
              config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
                },
                systemInstruction: { parts: [{ text: systemInstruction }] },
              },
              callbacks: {
                onmessage: (message: LiveServerMessage) => {
                  const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  const outputTx = message.serverContent?.outputTranscription?.text;
                  const partsText = message.serverContent?.modelTurn?.parts
                    ?.map((p: any) => p.text)
                    .filter(Boolean)
                    .join("") || "";
                  const modelText = outputTx || partsText || (message as any).text;
                  const userText = message.serverContent?.inputTranscription?.text;
                  const interrupted = message.serverContent?.interrupted;
                  const turnComplete = message.serverContent?.turnComplete;
                  const generationComplete = message.serverContent?.generationComplete;

                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                      audio: audio || undefined,
                      modelText: modelText || undefined,
                      userText: userText || undefined,
                      interrupted: !!interrupted,
                      turnComplete: !!turnComplete,
                      generationComplete: !!generationComplete,
                    }));
                  }
                },
                onerror: (err: any) => {
                  console.warn("Live session callback warning:", err?.message || err);
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ error: err?.message || "Live session warning" }));
                  }
                },
                onclose: () => {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: "session_closed" }));
                  }
                }
              },
            });

            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "ready" }));
            }
          } catch (connErr: any) {
            console.warn("Live connect error:", connErr?.message || connErr);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ error: connErr?.message || "Failed to initialize Live voice model." }));
            }
          }
        } else if (msg.type === "updateContext" && session) {
          // Dynamic document update during live chat session
          const files = msg.files || [];
          const fileNames = files.map((f: any) => f.name).join(", ");
          const fileContents = files.map((f: any) => `=== ${f.name} ===\n${(f.content || "").substring(0, 3000)}`).join('\n\n');
          
          const updateNotification = `[SYSTEM NOTIFICATION / DOCUMENT CONTEXT UPDATE]: The active documents in focus have been updated. Currently ${files.length} document(s) in focus: ${fileNames || "None"}.\n\nDocument Contents:\n${fileContents.substring(0, 30000)}`;
          
          try {
            session.sendClientContent({
              turns: [{ role: "user", parts: [{ text: updateNotification }] }],
              turnComplete: false,
            });
          } catch (e) {
            console.warn("Error sending context update to live session:", e);
          }
        } else if (msg.type === "text" && session) {
          // Send text message into the live session
          try {
            session.sendClientContent({
              turns: [{ role: "user", parts: [{ text: msg.text }] }],
              turnComplete: true,
            });
          } catch (e) {
            console.warn("Error sending text to live session:", e);
          }
        } else if (msg.audio && session) {
          // Stream mic audio to Gemini
          try {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
            });
          } catch (e) {
            // Drop individual audio frame on transient error without failing session
          }
        }
      } catch (err: any) {
        console.warn("WS message handling warning:", err?.message || err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ error: err?.message || "Failed to process live message" }));
        }
      }
    });
    
    clientWs.on("close", () => {
      if (session) {
        try { session.close(); } catch (e) {}
      }
    });

    clientWs.on("error", (err) => {
      console.error("Client WS socket error:", err);
      if (session) {
        try { session.close(); } catch (e) {}
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
