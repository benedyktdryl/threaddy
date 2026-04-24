import type { Database } from "bun:sqlite";
import type { SearchResult, SearchMode } from "../types/index";
import { semanticSearch } from "./semantic-search";
import { keywordSearch } from "./keyword-search";

const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

export async function hybridSearch(
  db: Database,
  query: string,
  mode: SearchMode,
  model: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): Promise<SearchResult[]> {
  if (mode === "semantic") {
    return semanticSearch(db, query, model, limit, provider, project);
  }

  if (mode === "keyword") {
    return keywordSearch(db, query, limit, provider, project);
  }

  // Hybrid: run both and merge
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(db, query, model, limit, provider, project),
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
