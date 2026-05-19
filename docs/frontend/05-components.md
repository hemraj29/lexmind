# Frontend — Components

Components are organised into three folders by surface area: **chat**, **sources**, **studio**, plus a handful of shared components.

```
components/
├── AppHeader.vue              global header (logo, case dropdown, share, settings, avatar)
├── FileUploader.vue           legacy dropzone (HomeView)
├── StepProgress.vue           legacy progress bar (PipelineView)
├── CitationPreview.vue        right-side slide-in citation pane (ChatView)
│
├── chat/                      message thread
│   ├── ChatHeader.vue
│   ├── ChatSidebar.vue
│   ├── ChatArea.vue
│   ├── ChatInput.vue
│   ├── MessageBubble.vue
│   ├── AnalysisCard.vue
│   ├── GenerationCard.vue
│   └── CommandChips.vue
│
├── sources/                   left panel
│   ├── SourcesPanel.vue
│   ├── SourceItem.vue
│   ├── AddSourceCard.vue
│   └── WebSearchBar.vue
│
└── studio/                    right panel
    ├── StudioPanel.vue
    ├── StudioGrid.vue
    └── StudioCard.vue
```

All components use `<script setup lang="ts">` and the typed `defineProps<>` / `defineEmits<>` generic forms.

---

## 1. Shared components

### `AppHeader.vue`

| Props | `title: string`, `caseCount: number`, `cases: Case[]`, `activeCaseId: string \| null`, `showCasesNav: boolean` |
| Emits | `new-case`, `toggle-cases`, `select-case` |

Layout: logo · title dropdown · share button · settings · avatar.
Dropdown content: list of cases + "+ New" button.
Closes on outside-click via `useEventListener("click", … )`.
Time-ago labels formatted by a private `timeAgo()` helper.

### `FileUploader.vue` (legacy)

| Props | `file: File \| null`, `preview: string \| null`, `error: string \| null`, `isDragging: boolean` |
| Emits | `drop`, `input`, `clear`, `dragover`, `dragleave` |

Dropzone with image preview for JPG/PNG and a generic file card for PDF. Hooked up via `useUpload()` in the parent.

### `StepProgress.vue` (legacy)

| Props | `steps: PipelineStep[]`, `progress: number` |
| Emits | — |

Progress bar at top + a vertical list of step rows. Status icon mapping:
- `pending` → grey dot
- `running` → blue spinner
- `success` → green checkmark
- `failed` → red X
For `running` / `failed` rows it shows `message` and `durationMs`.

### `CitationPreview.vue`

| Props | — (reads `citationStore`) |
| Emits | — |

Fixed right panel (42% width). Slides in/out 250 ms.
Header: source-type badge (STATUTE / JUDGMENT / CASE DOCUMENT / WEB SOURCE) · page indicator · close button.
Body:
- Title + reference.
- Excerpt block — highlighted yellow with italic emphasis.
- Inline viewer:
  - `WEB` → `<iframe :src="sourceUrl">`.
  - `DOCUMENT` → `<iframe :src="pdfUrl#page=N">` when available.
  - Otherwise — "Open original" external link.
- Loading spinner while `citationStore.loading`.

---

## 2. Chat components

### `ChatHeader.vue`
| Props | `caseTitle: string`, `sourceCount: number`, `enabledSourceCount: number` |
Layout: icon + title (clickable to edit) · date · "Customize" link · three-dot menu.

### `ChatSidebar.vue`
Left-rail navigation. Renders the case list as a vertical list (alternative to the dropdown in `AppHeader`). Only used at certain breakpoints / future.

### `ChatArea.vue`
| Props | `messages: ChatMessage[]`, `loading: boolean`, `activeCaseId: string \| null` |
| Internal ref | `scrollContainer` |

- Auto-scrolls to bottom on `messages.length` change (via `watchEffect`).
- Empty states:
  - No active case → big welcome card.
  - Active case + zero messages → "Start the conversation".
  - `loading` → centered spinner.
- Renders `<MessageBubble>` for each sorted message.

### `ChatInput.vue`
| Props | `disabled: boolean`, `sending: boolean`, `sourceCount: number` |
| Emits | `send(content: string, file?: File)` |

Layout: pill-shaped input — `@` attach button (file input) · textarea · send button (animated icon when `sending`).
File accept: `application/pdf, image/*, .docx`.
Keyboard:
- `Enter` → send
- `Shift+Enter` → newline

Disclaimer line below: "May produce inaccurate answers. Verify before filing."

### `MessageBubble.vue`
| Props | `message: ChatMessage` |

Layout: avatar (AI bot icon for ASSISTANT/SYSTEM; user initials for USER) · content bubble · timestamp.

Content rendering by `message.type`:
- `TEXT` / `FILE_UPLOAD` / `COMMAND` — markdown rendering of `message.content`:
  - headings (`#`, `##`, `###`)
  - bold (`**`)
  - italic (`*`)
  - bullet (`- `) / numbered (`1. `) lists
  - inline citations `[^cite_N]` → clickable chips (blue link style)
- `ANALYSIS_CARD` → delegate to `<AnalysisCard :data />`.
- `GENERATION_CARD` → delegate to `<GenerationCard :data />`.

Clicking a citation chip → `citationStore.open(citationId)`.

Thinking state: if `message.metadata.thinking === true`, animate a pulsing dot row instead of content.

### `AnalysisCard.vue`
| Props | `data: any` (parsed from `message.content`) |

Two display modes based on `data.kind`:

a) **Document analysis** — for `@analyze` against an uploaded document.
```
Header: doc-type badge + confidence %
Fields: key-value rows (name, age, FIR no, sections, …)
```

b) **Case analysis** — strengths / weaknesses / recommendations.
```
Bail prospect badge (likely / uncertain / unlikely → green/amber/red)
Strengths (3 max, + green prefix)
Weaknesses (3 max, − red prefix)
Recommendations (numbered, with reasoning snippet)
```

### `GenerationCard.vue`
| Props | `data: { type, runId, status, downloadUrl?, markdown? }` |

Header: document icon + generation type label · status badge.
Body: truncated markdown preview (max-height with fade).
Footer: "Download" button if `status === "completed"`.

Supported types: `regular_bail`, `anticipatory_bail`, `default_bail`, `quashing_petition`, `discharge_application`, `criminal_appeal`. Future: civil types.

### `CommandChips.vue`
| Emits | `command(cmd: string)` |

Renders the `@command` chip row above the chat input.
First attempt: `GET /api/commands`. On failure → hardcoded fallback list (`@bail`, `@anticipatory`, `@quashing`, `@discharge`, `@analyze`, `@cross_exam`, `@missing`).

Click a chip → emits `command` → parent injects it into the chat input.

---

## 3. Sources components

### `SourcesPanel.vue`
| Props | `caseId: string \| null` |
| Emits | `collapse` |

Sticky left rail (340 px). Header: title + source count badge + collapse caret.
Body sections:
1. `<AddSourceCard>` — primary "Add sources" button (file input, multi-accept).
2. `<WebSearchBar>` — query + source-type dropdown (Web / Fast Research).
3. List of `<SourceItem>` with bulk "Select all" checkbox in the footer.

Empty state: icon + "Saved sources will appear here".

### `SourceItem.vue`
| Props | `source: Source` |
| Emits | `toggle`, `remove` |

Row: checkbox · type icon (colour-coded) · title + meta (type · file name · confidence %) · three-dot menu.
On hover, the menu becomes interactive — currently only one option ("Remove").
Disabled state: opacity 60%.

### `AddSourceCard.vue`
| Props | `uploading: boolean`, `disabled: boolean` |
| Emits | `click` |

Big button with plus icon. Spinner while `uploading`.

### `WebSearchBar.vue`
| Props | `searching: boolean`, `disabled: boolean` |
| Emits | `search(query: string)` |

Header line "Search the web for new sources" · source type selector (Web / Fast Research) · query textarea · send button. The web-search endpoint is currently a stub on the backend.

---

## 4. Studio components

### `StudioPanel.vue`
| Props | `caseId: string \| null` |
| Emits | `collapse`, `execute(action)` |

Right rail (340 px). Header + collapse caret.
Featured callouts at top: "Audio overview in 9 Indian languages" and "Try Mind Map" — both placeholders pending implementation.

Three grids:
1. **Draft Documents** — `category === "draft"`.
2. **Case Analysis** — `category === "analyze"`.
3. **Research** — `category === "research"`.

Each grid is a `<StudioGrid :actions :executing :disabled @execute />`.

Footer: "+ Add note" button (placeholder).

### `StudioGrid.vue`
| Props | `actions: StudioAction[]`, `executing: string \| null`, `disabled: boolean` |
| Emits | `execute(action)` |

2-column grid of `<StudioCard>`.

### `StudioCard.vue`
| Props | `action: StudioAction`, `executing: boolean`, `disabled: boolean` |
| Emits | `click` |

Small card: coloured icon background + label.
Hover: border + shadow.
`executing` → spinner replaces icon, card becomes non-interactive.
`disabled` → 40% opacity + `cursor-not-allowed`.

Icon → SVG resolved from a hardcoded map of `iconName` strings.

---

## 5. Component conventions

| Convention | Why |
|-----------|-----|
| `<script setup lang="ts">` everywhere | tighter typing, less ceremony |
| `defineProps<>` / `defineEmits<>` generic forms | full type-checking |
| One responsibility per component | makes them easy to reuse and test |
| Smart components (views) → dumb components (cards, lists, buttons) | views own state; components own presentation |
| Tailwind classes for everything | no scoped styles to maintain |
| `name` slot not used; we don't need named slots yet | KISS |
| Avoid `provide / inject` | use Pinia stores or props/emits — easier to trace |

---

End of frontend track. Continue with the [planning track](../planning/01-roadmap.md).
