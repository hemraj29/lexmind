import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "chat",
      component: () => import("@/views/ChatView.vue"),
    },
    {
      path: "/case/:id",
      name: "case-chat",
      component: () => import("@/views/ChatView.vue"),
      props: true,
    },
    {
      path: "/sections",
      name: "sections",
      component: () => import("@/views/SectionsView.vue"),
    },
    // Legacy routes (keep for backward compat)
    {
      path: "/legacy",
      name: "legacy-home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/pipeline/:id",
      name: "pipeline",
      component: () => import("@/views/PipelineView.vue"),
      props: true,
    },
    {
      path: "/draft/:id",
      name: "draft",
      component: () => import("@/views/DraftView.vue"),
      props: true,
    },
    {
      path: "/history",
      name: "history",
      component: () => import("@/views/HistoryView.vue"),
    },
  ],
});

export default router;
