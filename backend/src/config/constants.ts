export const PINECONE_NAMESPACE_STATUTES = "statutes";
export const PINECONE_NAMESPACE_PRECEDENTS = "precedents";

export const EMBEDDING_DIMENSION = 1536; // text-embedding-3-small

export const DEFAULT_TOP_K = 10;
export const RERANK_TOP_K = 3;

export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const BAIL_TEMPLATE_SECTIONS = [
  "INTRODUCTION",
  "BRIEF_FACTS",
  "GROUNDS_FOR_BAIL",
  "LEGAL_ARGUMENTS",
  "PRAYER",
  "VERIFICATION",
] as const;
