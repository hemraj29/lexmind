import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
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
    {
      path: "/sections",
      name: "sections",
      component: () => import("@/views/SectionsView.vue"),
    },
  ],
});

export default router;
