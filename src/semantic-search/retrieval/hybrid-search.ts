import type { Database } from "bun:sqlite";
import type { SearchResult, SearchMode } from "../types/index";
import { semanticSearch } from "./semantic-search";
import { keywordSearch } from "./keyword-search";

const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

// The embedding model is loaded from disk/network on first use and can fail
// (missing/invalid model, offline, HF unreachable). Never let that crash a
// search — degrade to keyword results instead.
async function safeSemanticSearch(
  db: Database,
  query: string,
  model: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): Promise<SearchResult[]> {
  try {
    return await semanticSearch(db, query, model, limit, provider, project);
  } catch (error) {
    console.error("Semantic search failed, falling back to keyword:", error);
    return [];
  }
}

export async function hybridSearch(
  db: Database,
  query: string,
  mode: SearchMode,
  model: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): Promise<SearchResult[]> {
  if (mode === "keyword") {
    return keywordSearch(db, query, limit, provider, project);
  }

  if (mode === "semantic") {
    const results = await safeSemanticSearch(db, query, model, limit, provider, project);
    // If the embedding model is unavailable, fall back to keyword so the user
    // still gets results rather than an empty page.
    return results.length > 0 ? results : keywordSearch(db, query, limit, provider, project);
  }

  // Hybrid: run both and merge
  const [semanticResults, keywordResults] = await Promise.all([
    safeSemanticSearch(db, query, model, limit, provider, project),
    Promise.resolve(keywordSearch(db, query, limit, provider, project)),
  ]);

  // Build score map keyed by threadId (deduplicate to one result per thread)
  const scoreMap = new Map<string, { result: SearchResult; hybridScore: number }>();

  for (const r of semanticResults) {
    const existing = scoreMap.get(r.threadId);
    const score = r.score * SEMANTIC_WEIGHT;
    if (!existing || score > existing.hybridScore) {
      scoreMap.set(r.threadId, { result: { ...r, matchedBy: "hybrid" }, hybridScore: score });
    }
  }

  for (const r of keywordResults) {
    const existing = scoreMap.get(r.threadId);
    const kScore = r.score * KEYWORD_WEIGHT;
    if (existing) {
      const combined = existing.hybridScore + kScore;
      scoreMap.set(r.threadId, {
        result: { ...existing.result, score: combined, matchedBy: "hybrid" },
        hybridScore: combined,
      });
    } else {
      scoreMap.set(r.threadId, { result: { ...r, matchedBy: "hybrid" }, hybridScore: kScore });
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit)
    .map(({ result, hybridScore }) => ({ ...result, score: hybridScore }));
}
