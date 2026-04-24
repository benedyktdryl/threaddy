// Lazy-loaded — model is NOT loaded on app startup, only when semantic indexing is triggered

let featurePipeline: ((texts: string[], options: Record<string, unknown>) => Promise<unknown>) | null = null;

export const EMBEDDING_DIMS = 384;

async function getPipeline(model: string) {
  if (!featurePipeline) {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Cache models locally to avoid re-downloading
    env.cacheDir = `${process.env.HOME ?? "~"}/.cache/huggingface/hub`;
    // @ts-ignore — pipeline typing is complex
    featurePipeline = await pipeline("feature-extraction", model, { dtype: "fp32" });
  }
  return featurePipeline;
}

export async function embedTexts(texts: string[], model: string): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const pipe = await getPipeline(model);
  // @ts-ignore — output type depends on model
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  // output.tolist() returns number[][]
  // @ts-ignore
  const list: number[][] = output.tolist();
  return list.map((arr) => new Float32Array(arr));
}

export async function embedText(text: string, model: string): Promise<Float32Array> {
  const results = await embedTexts([text], model);
  return results[0];
}

