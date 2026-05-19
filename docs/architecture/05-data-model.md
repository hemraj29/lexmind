# Data Model

Source of truth: [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).
This page documents every model, field, enum, index, and relation so you can write queries / migrations without re-reading the schema.

There are **18 models** in 4 logical groups:

| Group | Models |
|-------|--------|
| **Operational** (case lifecycle) | `Case`, `ChatMessage`, `CaseDocument`, `PipelineRun`, `GeneratedDocument`, `Citation`, `CitationCache` |
| **Knowledge graph** (legal corpus) | `Act`, `Chapter`, `StatuteSection`, `SectionRelation`, `IPCMapping`, `Precedent`, `PrecedentSection` |
| **Plugin mirror** (UI catalog) | `LegalDomain`, `RegisteredDocumentType`, `StudioAction`, `ChatCommand` |

---

## 1. Operational tables

### `Case`
The notebook / matter that owns everything else.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid, pk) | |
| `title` | `String` | optional, default to "Untitled Case" |
| `caseNumber` | `String?` | court case number once filed |
| `clientName` | `String?` | |
| `court` | `String?` | |
| `district`, `state` | `String?` | |
| `status` | `CaseStatus` | `ACTIVE` / `CLOSED` / `ARCHIVED`, default `ACTIVE` |
| `summary` | `String?` | running synthesis (set by Strategy Advisor `@summary`) |
| `sectionsRaw` | `String[]` | raw section refs detected across docs (e.g. `["BNS 303", "BNSS 480"]`) |
| `tags` | `String[]` | |
| `createdAt`, `updatedAt` | `DateTime` | |

Relations: `messages[]`, `documents[]`, `pipelineRuns[]`, `generatedDocs[]`.
Indexes: `(status)`, `(createdAt DESC)`.

### `ChatMessage`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | |
| `caseId` | `String → Case` | cascade |
| `role` | `MessageRole` | `USER` / `ASSISTANT` / `SYSTEM` |
| `type` | `MessageType` | `TEXT` / `FILE_UPLOAD` / `COMMAND` / `ANALYSIS_CARD` / `GENERATION_CARD` |
| `content` | `String` | text or JSON payload for card types |
| `documentId` | `String → CaseDocument?` | for `FILE_UPLOAD` |
| `pipelineRunId` | `String → PipelineRun?` | for `GENERATION_CARD` |
| `metadata` | `Json?` | flexible bag (used by analyzer/advisor) |
| `createdAt` | `DateTime` | |

Relations: `citations[]`.
Indexes: `(caseId, createdAt)`.

### `CaseDocument`
Uploaded source files (FIR, chargesheet, …).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `caseId` | `String → Case` | cascade |
| `docType` | `CaseDocumentType` | `FIR` / `CHARGESHEET` / `COURT_ORDER` / `WITNESS_STATEMENT` / `EVIDENCE` / `PREVIOUS_PETITION` / `OTHER` |
| `fileName`, `mimeType`, `filePath` | `String` | |
| `fileSize` | `Int` | bytes |
| `extractedData` | `Json?` | discriminated union by `docType` — see `document.types.ts` |
| `rawText` | `String?` | best-effort OCR/text extract |
| `confidence` | `Float?` | 0–1 |
| `enabled` | `Boolean` | toggle in Sources panel |
| `title` | `String?` | user-set display title |
| `createdAt`, `updatedAt` | `DateTime` | |

Relations: `chatMessages[]`, `pipelineRuns[]`, `citations[]`.
Indexes: `(caseId)`, `(docType)`.

### `PipelineRun`
One end-to-end workflow execution.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `caseId` | `String → Case?` | nullable for legacy stand-alone runs |
| `documentId` | `String → CaseDocument?` | the trigger source |
| `generationType` | `GenerationDocType` | which drafter was used |
| `status` | `RunStatus` | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED` |
| `fileName`, `mimeType`, `uploadPath` | `String?` | for legacy upload path |
| `extractedData` | `Json?` | ExtractedFIR or analyzer output |
| `legalMemo` | `Json?` | LegalMemo |
| `draftMarkdown` | `String?` | rendered text of the draft |
| `docxPath` | `String?` | filesystem location |
| `steps` | `Json[]` | array of `StepResult` |
| `currentStep` | `String?` | for live progress |
| `totalDurationMs` | `Int?` | |
| `error` | `String?` | |
| `createdAt`, `updatedAt`, `completedAt` | `DateTime?` | |

Relations: `documents[]` (GeneratedDocument), `chatMessages[]`, `citations[]`.
Indexes: `(status)`, `(caseId)`, `(createdAt DESC)`.

### `GeneratedDocument`
Materialised output (`.docx`, possibly `.pdf`).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `pipelineRunId` | `String → PipelineRun` | cascade |
| `caseId` | `String → Case?` | for direct lookup |
| `docType` | `GenerationDocType` | |
| `filePath`, `mimeType` | `String` | |
| `fileSize` | `Int` | bytes |
| `createdAt` | `DateTime` | |

Index: `(caseId)`.

### `Citation`
Traceable provenance for a generated claim.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `messageId` | `String → ChatMessage?` | for inline citations in chat |
| `pipelineRunId` | `String → PipelineRun?` | for pipeline-emitted citations |
| `sourceType` | `CitationSourceType` | `SECTION` / `PRECEDENT` / `DOCUMENT` / `WEB` |
| `sectionId` | `String → StatuteSection?` | when sourceType=SECTION |
| `pageNumber`, `paragraphRef` | `Int?` / `String?` | citation precision |
| `precedentId` | `String → Precedent?` | when sourceType=PRECEDENT |
| `sccReference`, `passageStart`, `passageEnd` | `String?`/`Int?` | for precedents |
| `documentId` | `String → CaseDocument?` | when sourceType=DOCUMENT |
| `documentPage` | `Int?` | |
| `webUrl`, `webTitle` | `String?` | when sourceType=WEB |
| `excerptText`, `fullSourceUrl` | `String?` | |
| `createdAt` | `DateTime` | |

Indexes: `(messageId)`, `(sectionId)`, `(precedentId)`, `(documentId)`.

### `CitationCache`
Provider response cache.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `queryHash` | `String` (unique) | hash of (query, providerId, options) |
| `providerId` | `String` | e.g. `"indian-kanoon"` |
| `candidates` | `Json[]` | `CitationCandidate[]` |
| `expiresAt` | `DateTime` | TTL-based eviction by caller |

Indexes: `(providerId)`, `(expiresAt)`.

---

## 2. Knowledge graph tables

### `Act`
| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `code` | `ActType` (enum: `BNS` / `BNSS` / `BSA`) | unique |
| `fullName` | `String` | "Bharatiya Nyaya Sanhita, 2023" |
| `year` | `Int` | |
| `description` | `String?` | |
| `replacedAct` | `String?` | e.g. `"IPC"` |

> Civil-side acts (CPC, Contract Act, etc.) currently live as **ActPlugin JSON** under `backend/src/acts/civil/` and are loaded by the registry, not the DB enum. Plan: convert `ActType` from an enum to a `String` (free-form code) — tracked under [Roadmap Phase 2](../planning/01-roadmap.md).

### `Chapter`
| Field | Type | Notes |
|-------|------|-------|
| `id`, `actId → Act` | | |
| `number` | `Int` | |
| `title`, `description` | `String?` | |
| **unique** | `(actId, number)` | |

### `StatuteSection`
The heart of the legal corpus.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `actId` | `String → Act` | |
| `actType` | `ActType` | denormalised for fast filtering |
| `chapterId` | `String → Chapter?` | |
| `sectionNumber` | `String` | string to support `153A`, `498A` |
| `title`, `description`, `summary` | `String?` | |
| `offenceType` | `OffenceType?` | `COGNIZABLE` / `NON_COGNIZABLE` |
| `bailable` | `Boolean?` | nullable for civil / procedural |
| `compoundable` | `Boolean?` | |
| `punishment` | `String?` | free-form text |
| `minPunishment`, `maxPunishment` | `String?` | |
| `ingredients`, `keywords`, `exceptions` | `String[]` | postgres arrays |
| `explanation` | `String?` | scholarly notes |
| `embedding` | `Unsupported("vector(1536)")` | pgvector column |
| `createdAt` | `DateTime` | |

Relations:
- `ipcMappingsAsBNS[]` — incoming IPC→BNS mappings
- `precedentLinks[]` — `PrecedentSection`
- `citations[]`
- `relations[]` / `inverseRelations[]` — `SectionRelation`

Indexes: `(actType)`, `(bailable)`, `(sectionNumber)`, `(actId)`.
Unique: `(actType, sectionNumber)`.

### `SectionRelation`
A directed edge in the legal knowledge graph.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `fromSectionId`, `toSectionId` | `String → StatuteSection` | |
| `relationType` | `String` | e.g. `"refers_to"`, `"replaces"`, `"explains"` |
| `confidence` | `Float?` | optional 0–1 |
| `notes` | `String?` | |

Unique: `(fromSectionId, toSectionId, relationType)`.
Indexes: `(fromSectionId)`, `(toSectionId)`.

### `IPCMapping`
Lookup: `IPC <section>` → `BNS <section>`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `ipcSection` | `String` (unique) | e.g. `"420"` |
| `ipcTitle` | `String` | |
| `bnsSection` | `String` | |
| `bnsTitle` | `String` | |
| `bnsSectionId` | `String → StatuteSection` | |
| `changeType` | `MappingChangeType` | `RENAMED` / `MODIFIED` / `MERGED` / `SPLIT` / `NEW` / `REPEALED` |
| `notes` | `String?` | |

Index: `(bnsSection)`.

### `Precedent`
A landmark judgment.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `caseTitle` | `String` | |
| `citation` | `String` (unique) | e.g. `"(2024) 5 SCC 100"` |
| `court`, `bench` | `String?` | |
| `year` | `Int` | |
| `ratio` | `String?` | |
| `summary`, `headnotes` | `String?` | |
| `tags` | `String[]` | |
| `bailRelevant` | `Boolean` | enables bail-only filter |
| `embedding` | `Unsupported("vector(1536)")` | |

Indexes: `(court)`, `(year)`, `(bailRelevant)`.

### `PrecedentSection`
M:N join — which sections a precedent interprets.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | |
| `precedentId → Precedent` | cascade | |
| `sectionId → StatuteSection` | cascade | |
| `relevance` | `Float?` | |
| **unique** | `(precedentId, sectionId)` | |

---

## 3. Plugin-mirror tables

These are **populated by `bootstrap.ts`** from the on-disk plugin files so the frontend can read them via REST.

### `LegalDomain`
| Field | Type |
|-------|------|
| `id`, `code` (unique), `name`, `description?`, `iconName`, `colorHex`, `sortOrder`, `enabled` | |

Relations: `documentTypes[]`, `studioActions[]`, `chatCommands[]`.

### `RegisteredDocumentType`
| Field | Type |
|-------|------|
| `id`, `code` (unique), `name`, `description`, `domainId → LegalDomain`, `category` (`draft`/`analyze`/`research`/`extract`), `iconName`, `colorHex` | |
| `requiredSourceTypes` `String[]`, `primarySectionCodes` `String[]` | |
| `drafterPluginId` (string, not FK), `templateConfig?` `Json`, `command?` (unique), `enabled`, `sortOrder`, `usageCount` | |

Index: `(domainId)`.

### `StudioAction`
What surfaces in the right pane of `ChatView`.

| Field | Type |
|-------|------|
| `id`, `code` (unique), `label`, `description`, `iconName`, `colorHex`, `category`, `command?` | |
| `domainId → LegalDomain`, `requiredSourceTypes` `String[]`, `enabled`, `sortOrder` | |

Index: `(domainId)`.

### `ChatCommand`
What surfaces as chips in the chat input.

| Field | Type |
|-------|------|
| `id`, `cmd` (unique, e.g. `"@bail"`), `label`, `description`, `color`, `domainId → LegalDomain`, `documentTypeCode`, `enabled`, `sortOrder` | |

---

## 4. Enums

```ts
ActType                 = BNS | BNSS | BSA
OffenceType             = COGNIZABLE | NON_COGNIZABLE
RunStatus               = PENDING | RUNNING | COMPLETED | FAILED
MappingChangeType       = RENAMED | MODIFIED | MERGED | SPLIT | NEW | REPEALED
CaseStatus              = ACTIVE | CLOSED | ARCHIVED
CaseDocumentType        = FIR | CHARGESHEET | COURT_ORDER | WITNESS_STATEMENT
                        | EVIDENCE | PREVIOUS_PETITION | OTHER
GenerationDocType       = REGULAR_BAIL | ANTICIPATORY_BAIL | DEFAULT_BAIL
                        | QUASHING_PETITION | DISCHARGE_APPLICATION
                        | CRIMINAL_APPEAL | LEGAL_MEMO
CitationSourceType      = SECTION | PRECEDENT | DOCUMENT | WEB
MessageRole             = USER | ASSISTANT | SYSTEM
MessageType             = TEXT | FILE_UPLOAD | COMMAND | ANALYSIS_CARD | GENERATION_CARD
```

> Civil document types (plaint, written-statement, temporary-injunction) are **not** in `GenerationDocType` yet — they currently use the `LEGAL_MEMO` value as a placeholder when persisted. Migration plan: convert this enum to `String` so any drafter plugin can persist its own type code without schema changes. Tracked in [Roadmap Phase 2](../planning/01-roadmap.md).

---

## 5. Indexes you should respect when querying

| Query | Hits | Index |
|-------|------|-------|
| List active cases newest-first | `Case` | `(status)`, `(createdAt DESC)` |
| Load a case's chat | `ChatMessage` | `(caseId, createdAt)` |
| Show docs of a case | `CaseDocument` | `(caseId)` |
| Filter docs by type | `CaseDocument` | `(docType)` |
| Lookup section by `(act, number)` | `StatuteSection` | `unique (actType, sectionNumber)` |
| Filter bailable sections | `StatuteSection` | `(bailable)` |
| IPC → BNS | `IPCMapping` | `unique (ipcSection)` |
| List bail-relevant precedents | `Precedent` | `(bailRelevant)` |
| Run history | `PipelineRun` | `(status)`, `(createdAt DESC)`, `(caseId)` |

---

## 6. Vector columns

`pgvector` does **not** integrate with Prisma's type system, so it's declared as `Unsupported("vector(1536)")` on:

- `StatuteSection.embedding`
- `Precedent.embedding`

Reads/writes use raw SQL:

```sql
-- write
UPDATE statute_sections
SET embedding = $1::vector
WHERE id = $2;

-- read (cosine distance)
SELECT id, 1 - (embedding <=> $1::vector) AS score
FROM statute_sections
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

Encapsulated in:

- `database.service.ts → updateStatuteEmbedding / updatePrecedentEmbedding`
- `database.service.ts → vectorSearchStatutes / vectorSearchPrecedents`

For scale, add an HNSW index:

```sql
CREATE INDEX ON statute_sections
USING hnsw (embedding vector_cosine_ops);
```

---

## 7. Seed data

`backend/prisma/seed.ts`:

1. Upserts 3 `Act` rows — BNS, BNSS, BSA.
2. Upserts ~9 `Chapter` rows for sample top-level chapters.

Statute sections, precedents, and IPC mappings come from the **ingestion scripts**:

```bash
pnpm extract:books      # PDFs → JSON in src/data/statutes
pnpm enrich:data        # add ingredients/keywords via LLM
pnpm ingest:statutes    # JSON → Postgres + embeddings
pnpm ingest:precedents  # cases → Postgres + embeddings
```

---

Next: [API Reference](./06-api-reference.md).
