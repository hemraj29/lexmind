# Frontend — Developer Overview

The LexiMini frontend is a Vue 3 + Vite single-page app. It exposes two surfaces — the modern **ChatView** (default `/`) and the legacy **FIR → Bail** demo (`/legacy`) — that share the same backend services.

Stack:
- **Vue 3.5** Composition API + `<script setup>`.
- **Vite 6** for dev/build.
- **Pinia 2** for state.
- **Vue Router 4** for navigation.
- **Tailwind 4** via `@tailwindcss/vite` (no `tailwind.config.js`).
- No component library — every component is hand-coded.

```
frontend/src/
├── main.ts              app bootstrap (Pinia, Router, mount)
├── App.vue              <RouterView /> only
├── router/index.ts      7 routes
│
├── views/               page-level components (1 per route)
├── stores/              Pinia stores (1 per concern)
├── composables/         useApi · usePipeline · useUpload
├── components/          shared + chat/ + sources/ + studio/
└── assets/              static
```

---

## 1. Entry & routing

[`main.ts`](../../frontend/src/main.ts):

```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";

createApp(App).use(createPinia()).use(router).mount("#app");
```

[`router/index.ts`](../../frontend/src/router/index.ts):

| Path | View | Notes |
|------|------|-------|
| `/` | `ChatView` | primary 3-pane UI |
| `/case/:id` | `ChatView` | enters with that case selected |
| `/sections` | `SectionsView` | statute search |
| `/legacy` | `HomeView` | legacy FIR upload demo |
| `/pipeline/:id` | `PipelineView` | legacy live SSE progress |
| `/draft/:id` | `DraftView` | legacy generated draft |
| `/history` | `HistoryView` | legacy pipeline runs list |

History mode (`createWebHistory`) is used.

---

## 2. Dev server

[`vite.config.ts`](../../frontend/vite.config.ts):

```ts
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/output": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
```

Why proxy `/output` — generated `.docx` files are served by Express as static files; embedded preview links and downloads work in dev without an extra origin.

---

## 3. State model at a glance

```
                    ┌───────────────────────────────────┐
                    │  composables/useApi (axios-free)  │
                    │   get / post / uploadFile         │
                    └────────────────┬──────────────────┘
                                     │
   ┌─────────────────┬─────────────────┼─────────────────┬─────────────────┐
   ▼                 ▼                 ▼                 ▼                 ▼
casesStore     chatStore         sourcesStore       studioStore       citationStore
list/create   messages / send    docs / upload      action catalog    open() / preview

                                pipelineStore (legacy only)
                                history / current result

                composables/usePipeline (legacy):
                  start() → POST /pipeline/run → EventSource(/stream)
                  step state for the StepProgress component
```

Each store owns one slice. Cross-store reads happen in views (composition) — stores don't import each other.

---

## 4. Per-view ownership

| View | Stores it uses | Routes it hits |
|------|----------------|----------------|
| `ChatView` | cases, chat, sources, studio, citation | `/cases`, `/cases/:id/messages`, `/cases/:id/sources`, `/studio-actions`, `/citations/:id/preview` |
| `SectionsView` | (uses `useApi` directly) | `/sections/search` |
| `HomeView` (legacy) | usePipeline | `POST /pipeline/run`, SSE `/pipeline/:id/stream` |
| `PipelineView` (legacy) | usePipeline | SSE only |
| `DraftView` (legacy) | pipeline | `/pipeline/:id/result`, `/pipeline/:id/download` |
| `HistoryView` (legacy) | pipeline | `/pipeline?limit=20` |

---

## 5. Styling

Tailwind 4 via the Vite plugin — no `tailwind.config.js`. Theme tokens are declared in `assets/main.css` using `@theme`. Common patterns:

- Container width: `max-w-7xl`, `max-w-3xl` for chat.
- Surface: `bg-white border border-gray-200 rounded-2xl`.
- Slate / Indigo accent: `text-indigo-600`, `bg-indigo-50`, `hover:bg-gray-50`.
- Animations: 250 ms `transition-transform` for the slide-in citation pane and panel collapse/expand.

No icon library — icons are inline SVGs. The component `studio/StudioCard.vue` keeps a hand-curated icon map (`scale`, `shield`, `x-circle`, `file-x`, `arrow-up-circle`, `clock`, `chart`, `file-text`, `alert`, `help-circle`, `book`, `gavel`).

---

## 6. Common patterns

### API call
```ts
import { useApi } from "@/composables/useApi";

const api = useApi();
const result = await api.get<MyShape>("/path");          // null on error
if (result) { /* … */ }
```

`useApi` enforces the `{ success, data, error, timestamp }` envelope and sets `loading` / `error` refs.

### Store action
```ts
export const useFooStore = defineStore("foo", () => {
  const items = ref<Item[]>([]);
  const loading = ref(false);

  async function fetchAll() {
    loading.value = true;
    try {
      const api = useApi();
      const data = await api.get<Item[]>("/foo");
      if (data) items.value = data;
    } finally {
      loading.value = false;
    }
  }

  return { items, loading, fetchAll };
});
```

Setup-style stores. Return refs + functions; no `getters` block (just `computed()` where needed).

### Component prop / emit
```vue
<script setup lang="ts">
const props = defineProps<{ value: string; disabled?: boolean }>();
const emit  = defineEmits<{ change: [value: string] }>();
</script>
```

Always typed with the generic form. No runtime declarations.

### Watching a route param
```ts
import { useRoute } from "vue-router";
const route = useRoute();
watch(() => route.params.id as string, async id => { /* … */ }, { immediate: true });
```

Used by `ChatView`, `PipelineView`, `DraftView`.

### SSE
```ts
const es = new EventSource("/api/pipeline/" + runId + "/stream");
es.onmessage = e => handleEvent(JSON.parse(e.data));
es.onerror = () => es.close();
```

The browser does *not* send Authorization headers on `EventSource`; for future auth, swap to fetch streaming or include the token in the URL signature.

---

## 7. Build & deploy

```bash
pnpm build       # → frontend/dist/
```

The output is fully static HTML/JS/CSS. Deploy via any CDN (Vercel, Netlify, Cloudflare Pages) or as static files behind the API host (Nginx/Caddy). For a single-domain deploy you can also use `express.static(path.join(__dirname, "frontend/dist"))` in the backend.

Vite proxy doesn't apply in prod — production builds hit `/api/*` directly. Set up reverse-proxy rules so `/api/*` and `/output/*` route to the backend.

---

Next: [Views](./02-views.md).
