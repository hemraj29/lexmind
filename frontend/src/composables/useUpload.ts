import { ref } from "vue";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE_MB = 20;

export function useUpload() {
  const file = ref<File | null>(null);
  const preview = ref<string | null>(null);
  const error = ref<string | null>(null);
  const isDragging = ref(false);

  function validate(f: File): boolean {
    error.value = null;

    if (!ACCEPTED_TYPES.includes(f.type)) {
      error.value = `Unsupported file type: ${f.type}. Upload PDF, JPG, or PNG.`;
      return false;
    }

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      error.value = `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_SIZE_MB}MB.`;
      return false;
    }

    return true;
  }

  function handleFile(f: File) {
    if (!validate(f)) return;
    file.value = f;

    // Generate preview for images
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.value = e.target?.result as string;
      };
      reader.readAsDataURL(f);
    } else {
      preview.value = null;
    }
  }

  function handleDrop(e: DragEvent) {
    isDragging.value = false;
    const f = e.dataTransfer?.files[0];
    if (f) handleFile(f);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const f = target.files?.[0];
    if (f) handleFile(f);
  }

  function clear() {
    file.value = null;
    preview.value = null;
    error.value = null;
  }

  return {
    file,
    preview,
    error,
    isDragging,
    handleDrop,
    handleInput,
    clear,
  };
}
