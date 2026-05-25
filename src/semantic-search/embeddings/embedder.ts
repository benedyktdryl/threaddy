// Lazy-loaded — model is NOT loaded on app startup unless warmupEmbedder() is called.
// getPipeline is guarded by a single in-flight promise so concurrent calls
// (e.g. pre-warm + first search) never trigger two simultaneous model loads.

import { join } from "node:path";
import { homedir } from "node:os";

type Pipeline = (texts: string[], options: Record<string, unknown>) => Promise<unknown>;

let featurePipeline: Pipeline | null = null;
let loadingPromise: Promise<Pipeline> | null = null;

const CACHE_DIR = join(homedir(), ".cache", "huggingface", "hub");

async function loadPipeline(model: string): Promise<Pipeline> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = CACHE_DIR;
  // q8 = int8-quantized ONNX — ~4x smaller than fp32, minimal accuracy loss
  // @ts-ignore — pipeline typing is complex
  const pipe = await pipeline("feature-extraction", model, { dtype: "q8" });
  featurePipeline = pipe as Pipeline;
  return featurePipeline;
}

function getPipeline(model: string): Promise<Pipeline> {
  if (featurePipeline) return Promise.resolve(featurePipeline);
  if (!loadingPromise) {
    loadingPromise = loadPipeline(model).catch((err) => {
      // Reset so a subsequent call can retry (e.g. after a transient network error)
      loadingPromise = null;
      throw err;
    });
  }
  return loadingPromise;
}

export const EMBEDDING_DIMS = 384;

/** Call on server startup (non-blocking) to avoid cold-load latency on first search. */
export function warmupEmbedder(model: string): void {
  getPipeline(model).catch(() => {
    // Startup warm-up failure is non-fatal; the first search will retry.
  });
}

export async function embedTexts(texts: string[], model: string): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const pipe = await getPipeline(model);
  // @ts-ignore — output type depends on model
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  // @ts-ignore
  const list: number[][] = output.tolist();
  return list.map((arr) => new Float32Array(arr));
}

export async function embedText(text: string, model: string): Promise<Float32Array> {
  const results = await embedTexts([text], model);
  return results[0];
}
