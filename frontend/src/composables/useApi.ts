import { ref } from "vue";

const BASE_URL = "/api";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export function useApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function get<T>(path: string): Promise<T | null> {
    loading.value = true;
    error.value = null;

    try {
      const res = await fetch(`${BASE_URL}${path}`);
      const json: ApiResponse<T> = await res.json();

      if (!json.success) {
        error.value = json.error || "Request failed";
        return null;
      }

      return json.data ?? null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Network error";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function post<T>(path: string, body?: unknown): Promise<T | null> {
    loading.value = true;
    error.value = null;

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json: ApiResponse<T> = await res.json();

      if (!json.success) {
        error.value = json.error || "Request failed";
        return null;
      }

      return json.data ?? null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Network error";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function uploadFile<T>(path: string, file: File): Promise<T | null> {
    loading.value = true;
    error.value = null;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        body: formData,
      });
      const json: ApiResponse<T> = await res.json();

      if (!json.success) {
        error.value = json.error || "Upload failed";
        return null;
      }

      return json.data ?? null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Network error";
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, get, post, uploadFile };
}
