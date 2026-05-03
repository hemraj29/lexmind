import { prisma } from "./database.service.js";
import { storageService } from "./storage.service.js";
import { openaiService } from "./openai.service.js";
import { hybridSearchService } from "./hybrid-search.service.js";
import { documentAnalyzerAgent } from "../agents/document-analyzer.agent.js";
import { strategyAdvisorAgent } from "../agents/strategy-advisor.agent.js";
import { drafterFactory } from "../agents/drafter-factory.agent.js";
import { researcherAgent } from "../agents/researcher.agent.js";
import { createChildLogger } from "../utils/logger.js";
import { parseCommand, CHAT_COMMANDS } from "../types/case.types.js";
import type { CaseContext } from "../types/strategy.types.js";
import type { CaseWithDocuments } from "../types/case.types.js";
import type { GenerationType } from "../types/generation.types.js";
import type { LegalMemo } from "../types/legal.types.js";

const log = createChildLogger("chat-service");

export interface MessageResult {
  role: "assistant";
  type: "text" | "analysis_card" | "generation_card" | "file_upload";
  content: string;
  metadata?: Record<string, unknown>;
  documentId?: string;
  pipelineRunId?: string;
}

// ─── CASE CRUD ─────────���────────────────────────────────

export async function createCase(data: { title?: string; clientName?: string; court?: string; district?: string; state?: string }) {
  return prisma.case.create({
    data: {
      title: data.title || "New Case",
      clientName: data.clientName,
      court: data.court,
      district: data.district,
      state: data.state,
      sectionsRaw: [],
    },
  });
}

export async function listCases() {
  return prisma.case.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { documents: true, messages: true, generatedDocs: true } },
    },
  });
}

export async function getCase(id: string) {
  return prisma.case.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
      generatedDocs: { orderBy: { createdAt: "desc" } },
      _count: { select: { messages: true } },
    },
  });
}

export async function getChatHistory(caseId: string, limit = 50, before?: string) {
  return prisma.chatMessage.findMany({
    where: {
      caseId,
      ...(before && { createdAt: { lt: new Date(before) } }),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

// ─── MESSAGE ROUTER ──────────��──────────────────────────

export async function handleMessage(
  caseId: string,
  content: string,
  file?: { buffer: Buffer; fileName: string; mimeType: string }
): Promise<MessageResult> {
  // Save user message
  const userMsg = await prisma.chatMessage.create({
    data: {
      caseId,
      role: "USER",
      type: file ? "FILE_UPLOAD" : parseCommand(content) ? "COMMAND" : "TEXT",
      content: file ? `${content || ""}\n📎 ${file.fileName}` : content,
    },
  });

  // Route to handler
  if (file) {
    return handleFileUpload(caseId, content, file);
  }

  const cmd = parseCommand(content);
  if (cmd) {
    return handleCommand(caseId, cmd.type);
  }

  return handleChat(caseId, content);
}

// ─── FILE UPLOAD HANDLER ─────────��──────────────────────

async function handleFileUpload(
  caseId: string,
  content: string,
  file: { buffer: Buffer; fileName: string; mimeType: string }
): Promise<MessageResult> {
  log.info({ caseId, fileName: file.fileName }, "Processing file upload");

  // Save file to disk
  const { path: filePath } = await storageService.saveUpload(file.buffer, file.fileName);

  // Analyze document
  const analysis = await documentAnalyzerAgent.extract(file.buffer, file.mimeType);

  // Create CaseDocument record
  const doc = await prisma.caseDocument.create({
    data: {
      caseId,
      docType: analysis.docType.toUpperCase() as any,
      fileName: file.fileName,
      mimeType: file.mimeType,
      filePath,
      fileSize: file.buffer.length,
      extractedData: analysis.data as any,
      rawText: analysis.rawText,
      confidence: analysis.confidence,
    },
  });

  // Update case sections from extracted data
  await updateCaseSections(caseId, analysis.data);

  // Build analysis card content
  const cardContent = JSON.stringify({
    docType: analysis.docType,
    extractedData: analysis.data,
    confidence: analysis.confidence,
    documentId: doc.id,
  });

  // Save assistant response
  await prisma.chatMessage.create({
    data: {
      caseId,
      role: "ASSISTANT",
      type: "ANALYSIS_CARD",
      content: cardContent,
      documentId: doc.id,
    },
  });

  // Generate a brief commentary
  const commentary = await generateDocumentCommentary(caseId, analysis);

  // Save commentary as follow-up text message
  await prisma.chatMessage.create({
    data: {
      caseId,
      role: "ASSISTANT",
      type: "TEXT",
      content: commentary,
    },
  });

  return {
    role: "assistant",
    type: "analysis_card",
    content: cardContent,
    metadata: { commentary },
    documentId: doc.id,
  };
}

// ─── @COMMAND HANDLER ────────────────���──────────────────

async function handleCommand(caseId: string, commandType: string): Promise<MessageResult> {
  log.info({ caseId, commandType }, "Handling @command");

  const caseData = await loadCaseWithDocuments(caseId);

  // Non-generation commands
  switch (commandType) {
    case "analyze": {
      const context = await buildCaseContext(caseId);
      const analysis = await strategyAdvisorAgent.analyzeCase(context);
      const cardContent = JSON.stringify(analysis);

      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "ANALYSIS_CARD", content: cardContent },
      });

      return { role: "assistant", type: "analysis_card", content: cardContent };
    }

    case "summary": {
      const context = await buildCaseContext(caseId);
      const summary = await strategyAdvisorAgent.generateSummary(context);

      await prisma.case.update({ where: { id: caseId }, data: { summary } });
      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "TEXT", content: summary },
      });

      return { role: "assistant", type: "text", content: summary };
    }

    case "missing": {
      const context = await buildCaseContext(caseId);
      const missing = await strategyAdvisorAgent.identifyMissingInfo(context);
      const content = "**Missing Information:**\n\n" + missing.map((m, i) => `${i + 1}. ${m}`).join("\n");

      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "TEXT", content },
      });

      return { role: "assistant", type: "text", content };
    }

    case "cross_exam": {
      const context = await buildCaseContext(caseId);
      const witnessDoc = caseData.documents.find((d) => d.docType === "witness_statement");
      const questions = await strategyAdvisorAgent.generateCrossExamQuestions(witnessDoc?.extractedData || {}, context);
      const content = "**Cross-Examination Questions:**\n\n" + questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "TEXT", content },
      });

      return { role: "assistant", type: "text", content };
    }

    case "sections": {
      const context = await buildCaseContext(caseId);
      const content = "**Applicable Sections:**\n\n" +
        context.applicableSections.map((s) =>
          `**${s.act} Section ${s.sectionNumber}** — ${s.title}\nBailable: ${s.bailable} | Punishment: ${s.punishment}`
        ).join("\n\n");

      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "TEXT", content },
      });

      return { role: "assistant", type: "text", content };
    }

    case "precedents": {
      const context = await buildCaseContext(caseId);
      const content = context.precedents.length > 0
        ? "**Relevant Precedents:**\n\n" + context.precedents.map((p) =>
            `**${p.caseTitle}** (${p.citation})\n${p.ratio}`
          ).join("\n\n")
        : "No relevant precedents found yet. Upload more documents for better results.";

      await prisma.chatMessage.create({
        data: { caseId, role: "ASSISTANT", type: "TEXT", content },
      });

      return { role: "assistant", type: "text", content };
    }
  }

  // Generation commands
  const genType = commandType as GenerationType;
  const memo = await researchCase(caseData);
  const result = await drafterFactory.draft(genType, caseData, memo);

  // Save .docx
  const { path: docxPath, fileName } = await storageService.saveOutput(result.docxBuffer, `${caseId}-${genType}`);

  // Create pipeline run record
  const run = await prisma.pipelineRun.create({
    data: {
      caseId,
      generationType: genType.toUpperCase().replace(/_/g, "_") as any,
      status: "COMPLETED",
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadPath: "",
      draftMarkdown: result.markdown,
      docxPath,
      extractedData: {},
      legalMemo: memo as any,
    },
  });

  // Create generated document record
  await prisma.generatedDocument.create({
    data: {
      pipelineRunId: run.id,
      caseId,
      docType: genType.toUpperCase().replace(/_/g, "_") as any,
      filePath: docxPath,
      fileSize: result.docxBuffer.length,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });

  const cardContent = JSON.stringify({
    type: genType,
    runId: run.id,
    status: "completed",
    downloadUrl: `/api/cases/${caseId}/generations/${run.id}/download`,
    markdown: result.markdown.slice(0, 500),
  });

  await prisma.chatMessage.create({
    data: {
      caseId,
      role: "ASSISTANT",
      type: "GENERATION_CARD",
      content: cardContent,
      pipelineRunId: run.id,
    },
  });

  return {
    role: "assistant",
    type: "generation_card",
    content: cardContent,
    pipelineRunId: run.id,
  };
}

// ─── CHAT HANDLER ─────────────��─────────────────────────

async function handleChat(caseId: string, message: string): Promise<MessageResult> {
  log.info({ caseId }, "Handling chat message");

  const context = await buildCaseContext(caseId);
  const result = await strategyAdvisorAgent.chat(message, context);

  await prisma.chatMessage.create({
    data: {
      caseId,
      role: "ASSISTANT",
      type: "TEXT",
      content: result.reply,
      metadata: result.metadata as any,
    },
  });

  return {
    role: "assistant",
    type: "text",
    content: result.reply,
    metadata: result.metadata,
  };
}

// ─── CONTEXT BUILDERS ───────────���───────────────────────

async function buildCaseContext(caseId: string): Promise<CaseContext> {
  const caseRecord = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      documents: true,
      messages: {
        where: { role: { in: ["USER", "ASSISTANT"] }, type: "TEXT" },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });

  // Get applicable sections from DB
  const sections = await getApplicableSections(caseRecord.sectionsRaw);

  // Get precedents
  const precedents = await getRelevantPrecedents(caseRecord.sectionsRaw);

  return {
    caseId,
    title: caseRecord.title,
    clientName: caseRecord.clientName || "",
    documents: caseRecord.documents.map((d) => ({
      docType: d.docType.toLowerCase(),
      extractedData: d.extractedData,
      rawText: d.rawText || undefined,
    })),
    sectionsRaw: caseRecord.sectionsRaw,
    applicableSections: sections,
    precedents,
    chatHistory: caseRecord.messages.reverse().map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    })),
  };
}

async function loadCaseWithDocuments(caseId: string): Promise<CaseWithDocuments> {
  const c = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { documents: true },
  });

  return {
    id: c.id,
    title: c.title,
    clientName: c.clientName || "",
    caseNumber: c.caseNumber || undefined,
    court: c.court || undefined,
    district: c.district || undefined,
    state: c.state || undefined,
    sectionsRaw: c.sectionsRaw,
    documents: c.documents.map((d) => ({
      id: d.id,
      docType: d.docType.toLowerCase() as any,
      fileName: d.fileName,
      extractedData: d.extractedData,
      rawText: d.rawText || undefined,
      confidence: d.confidence || undefined,
    })),
  };
}

async function researchCase(caseData: CaseWithDocuments): Promise<LegalMemo> {
  // Build a synthetic FIR-like object from all case documents for the researcher
  const allSections = caseData.sectionsRaw;
  const allFacts = caseData.documents
    .map((d) => {
      const data = d.extractedData as any;
      return data?.briefFacts || data?.prosecutionCase || data?.orderSummary || "";
    })
    .filter(Boolean)
    .join("\n\n");

  const firLike = {
    firNumber: "",
    date: "",
    policeStation: "",
    district: caseData.district || "",
    state: caseData.state || "",
    accused: [],
    victim: { name: "" },
    ioName: "",
    sectionsRaw: allSections,
    briefFacts: allFacts,
    rawText: "",
    confidence: 0.8,
  };

  return researcherAgent.research(firLike);
}

async function getApplicableSections(sectionsRaw: string[]) {
  const results: { act: string; sectionNumber: string; title: string; bailable: boolean; punishment: string; ingredients: string[] }[] = [];

  for (const ref of sectionsRaw) {
    const num = ref.replace(/[^0-9a-zA-Z]/g, " ").split(/\s+/).pop() || "";
    const section = await prisma.statuteSection.findFirst({ where: { sectionNumber: num } });
    if (section) {
      results.push({
        act: section.actType,
        sectionNumber: section.sectionNumber,
        title: section.title,
        bailable: section.bailable,
        punishment: section.punishment,
        ingredients: section.ingredients,
      });
    }
  }

  return results;
}

async function getRelevantPrecedents(sectionsRaw: string[]) {
  if (sectionsRaw.length === 0) return [];

  try {
    const query = `Bail and defense precedents for sections: ${sectionsRaw.join(", ")}`;
    const embedding = await openaiService.embed(query);

    const { vectorSearchPrecedents } = await import("./database.service.js");
    const matches = await vectorSearchPrecedents(embedding, 5, true);

    return matches.map((m) => ({
      caseTitle: m.case_title,
      citation: m.citation,
      ratio: m.ratio,
    }));
  } catch {
    return [];
  }
}

async function updateCaseSections(caseId: string, data: any) {
  const extractedSections: string[] = [];

  const inner = data?.data || data;
  if (inner?.sectionsRaw) extractedSections.push(...inner.sectionsRaw);
  if (inner?.sectionsCharged) extractedSections.push(...inner.sectionsCharged);

  if (extractedSections.length === 0) return;

  const existing = await prisma.case.findUnique({ where: { id: caseId }, select: { sectionsRaw: true } });
  const merged = [...new Set([...(existing?.sectionsRaw || []), ...extractedSections])];

  await prisma.case.update({
    where: { id: caseId },
    data: { sectionsRaw: merged },
  });
}

async function generateDocumentCommentary(caseId: string, analysis: any): Promise<string> {
  const docType = analysis.docType;
  const data = analysis.data?.data || analysis.data;

  const prompt = `You just analyzed a ${docType} for a criminal case. Give a brief (2-3 sentence) observation about what you found. Mention key facts and any immediate recommendations. Be direct and practical.

Extracted data: ${JSON.stringify(data).slice(0, 2000)}`;

  return openaiService.chat(
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 300 }
  );
}
