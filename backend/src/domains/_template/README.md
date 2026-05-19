# Domain Plugin Template

Copy this folder to add a new legal practice domain to LexiMini.

## How to add a new domain (e.g., Tax Law)

1. **Copy this folder:**
   ```
   cp -r src/domains/_template src/domains/tax
   ```

2. **Edit `tax/domain.config.ts`:**
   - Set `code: "tax"`, `name: "Tax Law"`
   - Add `keywords: ["GST", "income tax", "TDS", ...]`
   - Add `actReferences: ["IT_ACT_1961", "CGST", "SGST"]`
   - Define your `documentTypes`: `["it_appeal_reply", "gst_appeal", "drafting_notice", ...]`

3. **Create drafters in `tax/drafters/`:**
   - One file per document type
   - File name pattern: `<doc-name>.drafter.ts`
   - Each must export an object matching `DrafterPlugin`

4. **(Optional) Add act metadata in `src/acts/tax/`:**
   - One JSON per act: `it-act-1961.act.json`, `cgst.act.json`, etc.

5. **(Optional) Drop statute data in `src/data/statutes/tax/`:**
   - Run extraction script: `npm run extract:books -- --domain tax --pdf book/it-act-1961.pdf`

6. **Restart server.** Plugin auto-loads — no code changes anywhere else.

## What you DON'T touch

- ❌ `src/core/` — registries are domain-agnostic
- ❌ `src/agents/` — agents query the registries, don't know about domains
- ❌ `src/services/` — services are pure infrastructure
- ❌ `src/routes/` — routes are domain-agnostic
- ❌ `src/index.ts` — bootstrap auto-discovers your domain
- ❌ Frontend — Studio panel automatically gets your new doc types via `/api/studio-actions`

## Plugin contract

Every domain must export a `DomainPlugin`:

```typescript
{
  code: string,                              // "tax"
  name: string,                              // "Tax Law"
  description: string,
  iconName: string,
  colorHex: string,
  sortOrder: number,
  defaultActCodes: string[],
  documentTypes: DocumentTypeConfig[],
  routingHints: {
    keywords: string[],
    actReferences: string[],
    queryPatterns: RegExp[],
  },
  prerequisiteCheckers?: { [code]: PrerequisiteChecker },
}
```

Every drafter must export a `DrafterPlugin`:

```typescript
{
  id: string,                                // "tax.it_appeal_reply"
  domainCode: string,                        // "tax"
  documentTypeCode: string,                  // "it_appeal_reply"
  async draft(input: DrafterInput): DrafterOutput
}
```

## Verifying

```bash
npm run dev
# Look for log lines:
#   "Domain plugin loaded" code=tax
#   "Drafter plugin loaded" id=tax.it_appeal_reply
#   ...
#
# Then check the API:
curl http://localhost:3001/api/studio-actions?domain=tax
```

If the domain shows up in the API and the frontend Studio panel — you're done.
