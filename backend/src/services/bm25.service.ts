import { createChildLogger } from "../utils/logger.js";
import type { StatuteSection } from "../types/legal.types.js";

const log = createChildLogger("bm25");

interface BM25Document {
  id: string;
  text: string;
  section: StatuteSection;
}

interface BM25Result {
  section: StatuteSection;
  score: number;
}

class BM25Service {
  private documents: BM25Document[] = [];
  private avgDocLength = 0;
  private docFrequencies: Map<string, number> = new Map();
  private k1 = 1.5;
  private b = 0.75;

  load(sections: StatuteSection[]): void {
    this.documents = sections.map((s) => ({
      id: s.id,
      text: `${s.act} Section ${s.sectionNumber} ${s.title} ${s.description} ${s.ingredients.join(" ")} ${s.punishment}`.toLowerCase(),
      section: s,
    }));

    // Calculate avg doc length
    const totalLength = this.documents.reduce((sum, doc) => sum + this.tokenize(doc.text).length, 0);
    this.avgDocLength = totalLength / this.documents.length || 1;

    // Calculate document frequencies
    this.docFrequencies.clear();
    for (const doc of this.documents) {
      const uniqueTerms = new Set(this.tokenize(doc.text));
      for (const term of uniqueTerms) {
        this.docFrequencies.set(term, (this.docFrequencies.get(term) || 0) + 1);
      }
    }

    log.info({ documentCount: this.documents.length }, "BM25 index built");
  }

  search(query: string, topK: number = 10): BM25Result[] {
    if (this.documents.length === 0) {
      log.warn("BM25 search called with no documents loaded");
      return [];
    }

    const queryTerms = this.tokenize(query.toLowerCase());
    const N = this.documents.length;

    const scored = this.documents.map((doc) => {
      const docTerms = this.tokenize(doc.text);
      const docLength = docTerms.length;
      const termFreqs = this.getTermFrequencies(docTerms);

      let score = 0;
      for (const term of queryTerms) {
        const tf = termFreqs.get(term) || 0;
        const df = this.docFrequencies.get(term) || 0;

        if (tf === 0) continue;

        // IDF component
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // TF component with length normalization
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));

        score += idf * tfNorm;
      }

      return { section: doc.section, score };
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  searchExact(sectionRef: string): StatuteSection | null {
    const normalized = sectionRef.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const doc of this.documents) {
      const docNormalized = `${doc.section.act}${doc.section.sectionNumber}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (docNormalized === normalized) return doc.section;

      // Also match just the section number
      if (doc.section.sectionNumber === sectionRef) return doc.section;
    }

    return null;
  }

  get isLoaded(): boolean {
    return this.documents.length > 0;
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private getTermFrequencies(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    return freq;
  }
}

export const bm25Service = new BM25Service();
