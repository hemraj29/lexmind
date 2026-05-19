# Backend — Domains & Drafters

How LexiMini packages a whole legal practice area as a folder of plugin files.

This page walks through:
1. The Criminal domain plugin (6 drafters).
2. The Civil domain plugin (3 drafters).
3. The shared helper patterns each domain uses.
4. The `_template/` starter.

Background: [Plugin Architecture](../architecture/03-plugin-architecture.md).

```
backend/src/domains/
├── _template/                       starter (copy to begin a new domain)
│   ├── README.md
│   ├── domain.config.ts
│   └── drafters/
├── criminal/
│   ├── domain.config.ts
│   └── drafters/
│       ├── _shared.ts               buildCaseContext / generateFromPrompt / sectionsToMarkdown
│       ├── regular-bail.drafter.ts          → criminal.regular_bail
│       ├── anticipatory-bail.drafter.ts     → criminal.anticipatory_bail
│       ├── default-bail.drafter.ts          → criminal.default_bail
│       ├── quashing.drafter.ts              → criminal.quashing_petition
│       ├── discharge.drafter.ts             → criminal.discharge_application
│       └── appeal.drafter.ts                → criminal.criminal_appeal
└── civil/
    ├── domain.config.ts
    └── drafters/
        ├── _shared.ts                buildCivilContext / generateCivilDoc
        ├── plaint.drafter.ts                → civil.plaint
        ├── written-statement.drafter.ts     → civil.written_statement
        └── temporary-injunction.drafter.ts  → civil.temporary_injunction
```

---

## 1. Criminal domain

[`domains/criminal/domain.config.ts`](../../backend/src/domains/criminal/domain.config.ts):

```ts
export const criminalDomain: DomainPlugin = {
  code: "criminal",
  name: "Criminal Law",
  description: "Bail, FIR, chargesheet, discharge, quashing, appeals (BNS, BNSS, BSA, NDPS, POCSO, PMLA, UAPA, Arms Act).",
  iconName: "scale",
  colorHex: "#dc2626",
  sortOrder: 1,
  defaultActCodes: ["BNS", "BNSS", "BSA", "NDPS", "POCSO", "PMLA", "UAPA", "ARMS"],

  routingHints: {
    keywords: [
      "bail", "fir", "arrest", "accused", "criminal", "chargesheet",
      "cognizable", "non-bailable", "quashing", "discharge",
      "conviction", "acquittal",
    ],
    actReferences: ["BNS", "BNSS", "BSA", "IPC", "CrPC", "NDPS", "POCSO", "PMLA", "UAPA"],
    queryPatterns: [
      /section\s+\d+\s+of\s+(bns|bnss|bsa|ipc|crpc)/i,
      /\bfir\s+no\.?\s*\d+/i,
      /\b(regular|anticipatory|default)\s+bail\b/i,
      /\barrested\s+under\b/i,
    ],
  },

  documentTypes: [
    { code: "regular_bail",       name: "Regular Bail",          description: "Bail petition under Section 480 BNSS",  category: "draft", iconName: "scale",       colorHex: "#10b981", command: "@bail",         requiredSourceTypes: ["fir"],          primarySectionCodes: ["BNSS-480"], drafterId: "criminal.regular_bail",          sortOrder: 1 },
    { code: "anticipatory_bail",  name: "Anticipatory Bail",     description: "Pre-arrest bail under Section 482 BNSS",category: "draft", iconName: "shield",      colorHex: "#0ea5e9", command: "@anticipatory", requiredSourceTypes: ["fir"],          primarySectionCodes: ["BNSS-482"], drafterId: "criminal.anticipatory_bail",     sortOrder: 2 },
    { code: "default_bail",       name: "Default Bail",          description: "Statutory bail under Section 187 BNSS", category: "draft", iconName: "clock",       colorHex: "#6366f1", command: "@default_bail", requiredSourceTypes: [],               primarySectionCodes: ["BNSS-187"], drafterId: "criminal.default_bail",          sortOrder: 3 },
    { code: "quashing_petition",  name: "Quashing Petition",     description: "Quash FIR under Section 528 BNSS",      category: "draft", iconName: "x-circle",    colorHex: "#f59e0b", command: "@quashing",     requiredSourceTypes: ["fir"],          primarySectionCodes: ["BNSS-528"], drafterId: "criminal.quashing_petition",     sortOrder: 4 },
    { code: "discharge_application", name: "Discharge Application", description: "Section 250 BNSS discharge",        category: "draft", iconName: "file-x",      colorHex: "#8b5cf6", command: "@discharge",    requiredSourceTypes: ["chargesheet"],  primarySectionCodes: ["BNSS-250"], drafterId: "criminal.discharge_application", sortOrder: 5 },
    { code: "criminal_appeal",    name: "Criminal Appeal",       description: "Appeal against conviction/acquittal",   category: "draft", iconName: "arrow-up",    colorHex: "#06b6d4", command: "@appeal",       requiredSourceTypes: [],               primarySectionCodes: [],          drafterId: "criminal.criminal_appeal",       sortOrder: 6 },
  ],

  prerequisiteCheckers: {
    regular_bail:  (case_) => ({ ready: hasDoc(case_, "FIR"),         missing: hasDoc(case_, "FIR")         ? [] : ["FIR document"] }),
    discharge_application: (case_) => ({ ready: hasDoc(case_, "CHARGESHEET"), missing: hasDoc(case_, "CHARGESHEET") ? [] : ["Chargesheet"] }),
  },
};
```

### Drafters — common skeleton (`drafters/_shared.ts`)

```ts
export function buildCaseContext(caseData: CaseWithDocuments, memo: LegalMemo) {
  return {
    title: caseData.title,
    clientName: caseData.clientName,
    court: caseData.court ?? guessCourt(caseData),
    district: caseData.district,
    state: caseData.state,
    documents: caseData.documents
      .filter(d => d.enabled)
      .map(d => ({ docType: d.docType, extractedData: d.extractedData, rawText: d.rawText?.slice(0, 3000) })),
    applicableSections: memo.applicableSections.map(s => ({
      act: s.actType, number: s.sectionNumber, title: s.title,
      bailable: s.bailable, punishment: s.punishment, ingredients: s.ingredients,
    })),
    precedents: memo.precedents,
  };
}

export async function generateFromPrompt(prompt: string, opts?: { temperature?: number }) {
  return openaiService.chatJSON<Record<string, unknown>>(
    [{ role: "user", content: prompt }],
    { temperature: opts?.temperature ?? 0.3, maxTokens: 8192 }
  );
}

export function sectionsToMarkdown(title: string, sections: Record<string, unknown>): string {
  // converts JSON object to a markdown document (key → heading, arrays as numbered lists)
}
```

### Example drafter — `regular-bail.drafter.ts`

```ts
export const regularBailDrafter: DrafterPlugin = {
  id: "criminal.regular_bail",
  domainCode: "criminal",
  documentTypeCode: "regular_bail",

  async draft({ caseData, memo }) {
    const fir = extractFirFromCase(caseData);
    if (!fir) throw new Error("Regular bail requires an FIR in the case.");

    // delegate to the legacy bail-specific agent for the strongest prompt + dedicated docgen
    const { markdown, sections, docxBuffer } = await drafterAgent.draft(fir, memo);
    return { markdown, sections, docxBuffer };
  },
};
```

### Example — `anticipatory-bail.drafter.ts`

Builds its own prompt directly (no legacy delegation):

```ts
const prompt = `
You are drafting an Anticipatory Bail Application under Section 482 BNSS in the Court of Sessions Judge.

CASE CONTEXT
${JSON.stringify(buildCaseContext(caseData, memo)).slice(0, 6000)}

REQUIRED FIELDS (strict JSON):
{
  "courtName": "...",
  "title": "ANTICIPATORY BAIL APPLICATION UNDER SECTION 482 BNSS",
  "introduction": "...",
  "apprehensionGrounds": "why the applicant fears arrest (1-2 paragraphs, only from the case data)",
  "facts": "...",
  "grounds": ["...", "...", ...],            // 5-7 grounds
  "legalArguments": "...",
  "conditions": ["I will not leave …", "I will cooperate …"],
  "prayer": "..."
}

Cite ONLY sections from applicableSections. Cite ONLY precedents from precedents.
`;
const sections = await generateFromPrompt(prompt, { temperature: 0.3 });
const docxBuffer = await docgenService.generateFromSections("ANTICIPATORY_BAIL" as any, sections, caseData, memo);
const markdown = sectionsToMarkdown(sections.title as string, sections);
return { markdown, sections, docxBuffer };
```

Each criminal drafter follows the same outer shape:
1. Build context from caseData + memo.
2. Compose a prompt with explicit JSON keys for the section it needs.
3. `generateFromPrompt`.
4. Pass to `docgenService.generateFromSections`.
5. Return `{ markdown, sections, docxBuffer }`.

---

## 2. Civil domain

[`domains/civil/domain.config.ts`](../../backend/src/domains/civil/domain.config.ts):

```ts
export const civilDomain: DomainPlugin = {
  code: "civil",
  name: "Civil Litigation",
  description: "Plaints, written statements, civil applications, injunctions (CPC, Contract Act, Specific Relief, TPA).",
  iconName: "scale",
  colorHex: "#0ea5e9",
  sortOrder: 2,
  defaultActCodes: ["CPC", "CONTRACT_1872", "SPECIFIC_RELIEF_1963", "LIMITATION_1963", "TPA_1882"],

  routingHints: {
    keywords: ["plaint", "suit", "civil", "injunction", "decree", "damages", "contract", "breach", "tort", "negligence", "easement", "trespass", "civil court"],
    actReferences: ["CPC", "Contract Act", "Specific Relief", "TPA", "NI Act", "Limitation"],
    queryPatterns: [
      /order\s+[ivxlcdm]+\s+rule\s+\d+/i,
      /civil\s+suit/i,
      /section\s+\d+\s+of\s+(cpc|contract\s+act)/i,
      /\bplaint\b/i,
    ],
  },

  documentTypes: [
    { code: "plaint",                name: "Plaint",                description: "Originating pleading under Order VII CPC", category: "draft", iconName: "file-text", colorHex: "#0ea5e9", command: "@plaint",      requiredSourceTypes: [],          primarySectionCodes: ["CPC-O7-R1"],  drafterId: "civil.plaint",                sortOrder: 1 },
    { code: "written_statement",     name: "Written Statement",     description: "Defendant's reply under Order VIII CPC",   category: "draft", iconName: "file",      colorHex: "#6366f1", command: "@written_stmt", requiredSourceTypes: ["plaint"],  primarySectionCodes: ["CPC-O8-R1"],  drafterId: "civil.written_statement",     sortOrder: 2 },
    { code: "temporary_injunction",  name: "Temporary Injunction",  description: "Order 39 Rule 1-2 CPC application",        category: "draft", iconName: "shield",    colorHex: "#10b981", command: "@injunction",   requiredSourceTypes: ["plaint"],  primarySectionCodes: ["CPC-O39-R1"], drafterId: "civil.temporary_injunction",  sortOrder: 3 },
  ],
};
```

### `civil/drafters/_shared.ts`

```ts
export function buildCivilContext(caseData: CaseWithDocuments, memo: LegalMemo) {
  return {
    party: caseData.title,
    case: { court: caseData.court, district: caseData.district, state: caseData.state },
    documents: caseData.documents.filter(d => d.enabled).map(d => ({ docType: d.docType, extractedData: d.extractedData })),
    applicableProvisions: memo.applicableSections.map(s => ({ act: s.actType, ref: s.sectionNumber, title: s.title, summary: s.summary ?? s.description?.slice(0, 200) })),
  };
}

export async function generateCivilDoc(
  docType: GenerationDocType,
  prompt: string,
  caseData: CaseWithDocuments,
  memo: LegalMemo
) {
  const sections = await openaiService.chatJSON<Record<string, unknown>>(
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 8192 }
  );
  const docxBuffer = await docgenService.generateFromSections(docType, sections, caseData, memo);
  const markdown = sectionsToMarkdown(sections.title as string, sections);
  return { sections, docxBuffer, markdown };
}
```

### Example — `plaint.drafter.ts`

```ts
export const plaintDrafter: DrafterPlugin = {
  id: "civil.plaint",
  domainCode: "civil",
  documentTypeCode: "plaint",

  async draft({ caseData, memo }) {
    const ctx = buildCivilContext(caseData, memo);
    const prompt = `
You are drafting a Plaint under the Code of Civil Procedure, 1908 (Order VII Rule 1).

CASE CONTEXT
${JSON.stringify(ctx).slice(0, 6000)}

Return strict JSON with these keys:
{
  "courtName": "...",
  "title": "PLAINT UNDER ORDER VII RULE 1 CPC",
  "parties": "1. Plaintiff – ... \\n2. Defendant – ...",
  "facts": "chronological facts (only from documents above)",
  "causeOfAction": "...",
  "limitation": "the suit is within limitation because ...",
  "valuation": "Rs. ...",
  "jurisdiction": "...",
  "reliefs": ["...", "..."],
  "verification": "..."
}

Cite ONLY provisions in applicableProvisions.
`.trim();

    return generateCivilDoc("LEGAL_MEMO" as any, prompt, caseData, memo);    // see note below
  },
};
```

> Note: civil drafters currently persist their generated documents under the `LEGAL_MEMO` value of the `GenerationDocType` enum because the enum doesn't have civil entries yet. Migrating to a `String` codes column is in [Roadmap Phase 2](../planning/01-roadmap.md).

---

## 3. The `_template/` starter

[`domains/_template/`](../../backend/src/domains/_template/) — copy this folder to start a new domain.

Contents:
- `README.md` — instructions repeated below.
- `domain.config.ts` — empty domain shell.
- `drafters/` — empty.

The loader **explicitly skips `_template/`** so you can copy without colliding.

### Steps for a new domain (worked example: Tax)

```bash
cp -r src/domains/_template src/domains/tax
```

1. Edit `src/domains/tax/domain.config.ts`:
   - `code: "tax"`, `name`, `description`, `iconName`, `colorHex`, `sortOrder`.
   - `routingHints.keywords` + `queryPatterns` to route GST / ITR queries.
   - `defaultActCodes` (e.g. `IT_ACT_1961`, `CGST_2017`).
   - `documentTypes` (e.g. `it_appeal_reply`) — each with `drafterId: "tax.it_appeal_reply"`.

2. Create `src/domains/tax/drafters/it-appeal-reply.drafter.ts` exporting a `DrafterPlugin` whose `id` matches.

3. Drop `src/acts/tax/it-act-1961.act.json`.

4. (Optional) `src/data/statutes/tax/*.json` and run `pnpm ingest:statutes` to seed embeddings.

5. Restart. Bootstrap logs `domains=3, drafters=10, acts=N`. The Studio panel and `@command` chips update automatically — no frontend deploy.

A full code-by-code example lives in [Extending LexiMini](../planning/03-extending.md).

---

## 4. Patterns to follow

| Pattern | Why |
|--------|-----|
| Drafter id `<domain>.<docType>` | Lets `drafterFactory` resolve fallback by id pattern. |
| Always build context from `caseData + memo`, never from prompts | Keeps grounding consistent. |
| Always pass `applicableSections` and `precedents` as **JSON** in the prompt | Prevents the LLM from inventing them. |
| Always run output through `docgenService.generateFromSections` | Uniform formatting across drafters. |
| Keep drafter logic ≤ 60 LOC | If it's bigger, extract helpers into `_shared.ts`. |
| Domain `_shared.ts` is private to that domain | Don't import `criminal/_shared.ts` from `civil/`. |
| Use the `templateConfig` field on `DocumentTypeConfig` for variant knobs | E.g. "draft for Sessions Court vs High Court" without writing a new drafter. |

---

End of backend track. Continue with [Frontend Overview](../frontend/01-overview.md) or [Roadmap](../planning/01-roadmap.md).
