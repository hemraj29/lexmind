import { Router, type Request, type Response } from "express";
import { prisma } from "../services/database.service.js";
import type { ApiResponse } from "../types/api.types.js";

const router = Router();

// GET /api/studio-actions?domain=criminal — list available studio actions
router.get("/", async (req: Request, res: Response) => {
  const domainCode = req.query.domain as string | undefined;

  // Try DB first; fall back to defaults if no actions registered yet
  let actions: any[] = [];
  try {
    actions = await prisma.studioAction.findMany({
      where: {
        enabled: true,
        ...(domainCode && {
          domain: { code: domainCode },
        }),
      },
      include: { domain: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    actions = [];
  }

  if (actions.length === 0) {
    actions = defaultStudioActions(domainCode);
  } else {
    actions = actions.map((a: any) => ({
      id: a.id,
      code: a.code,
      label: a.label,
      description: a.description,
      iconName: a.iconName,
      colorHex: a.colorHex,
      category: a.category,
      domainCode: a.domain?.code,
      requiredSourceTypes: a.requiredSourceTypes,
      enabled: a.enabled,
      command: a.command,
    }));
  }

  res.json({
    success: true,
    data: actions,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse);
});

function defaultStudioActions(domainCode?: string) {
  const all = [
    { id: "1", code: "regular_bail", label: "Bail Application", description: "Generate Regular Bail under Sec 480 BNSS", iconName: "scale", colorHex: "#10b981", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@bail" },
    { id: "2", code: "anticipatory_bail", label: "Anticipatory Bail", description: "Pre-arrest bail under Sec 482 BNSS", iconName: "shield", colorHex: "#3b82f6", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@anticipatory" },
    { id: "3", code: "quashing_petition", label: "Quashing Petition", description: "Sec 528 BNSS - High Court petition", iconName: "x-circle", colorHex: "#a855f7", category: "draft", domainCode: "criminal", requiredSourceTypes: ["fir"], enabled: true, command: "@quashing" },
    { id: "4", code: "discharge_application", label: "Discharge Application", description: "Sec 250 BNSS discharge from charges", iconName: "file-x", colorHex: "#f97316", category: "draft", domainCode: "criminal", requiredSourceTypes: ["chargesheet"], enabled: true, command: "@discharge" },
    { id: "5", code: "criminal_appeal", label: "Criminal Appeal", description: "Appeal against conviction", iconName: "arrow-up-circle", colorHex: "#ef4444", category: "draft", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@appeal" },
    { id: "6", code: "default_bail", label: "Default Bail", description: "Sec 187 BNSS statutory bail", iconName: "clock", colorHex: "#14b8a6", category: "draft", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@default_bail" },
    { id: "7", code: "analyze", label: "Case Analysis", description: "Strengths, weaknesses, prosecution arguments", iconName: "chart", colorHex: "#eab308", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@analyze" },
    { id: "8", code: "summary", label: "Case Summary", description: "AI-generated case overview", iconName: "file-text", colorHex: "#6366f1", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@summary" },
    { id: "9", code: "missing", label: "Missing Information", description: "What you still need to gather", iconName: "alert", colorHex: "#64748b", category: "analyze", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@missing" },
    { id: "10", code: "cross_exam", label: "Cross-Examination", description: "Generate cross-exam questions", iconName: "help-circle", colorHex: "#ec4899", category: "analyze", domainCode: "criminal", requiredSourceTypes: ["witness_statement"], enabled: true, command: "@cross_exam" },
    { id: "11", code: "sections", label: "Applicable Sections", description: "List all relevant statute sections", iconName: "book", colorHex: "#0ea5e9", category: "research", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@sections" },
    { id: "12", code: "precedents", label: "Relevant Precedents", description: "Landmark case law for your case", iconName: "gavel", colorHex: "#8b5cf6", category: "research", domainCode: "criminal", requiredSourceTypes: [], enabled: true, command: "@precedents" },
  ];

  if (domainCode) return all.filter((a) => a.domainCode === domainCode);
  return all;
}

export default router;
