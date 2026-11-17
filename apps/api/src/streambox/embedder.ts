/**
 * Turns text into an embedding: a list of numbers that represents its meaning.
 *
 * Texts about the same subject get vectors pointing in a similar direction,
 * so "can I get my money back?" lands close to the refund policy even though
 * they share no words. That is what "search by meaning" is.
 */
import { EMBEDDING_DIMENSIONS } from '../db/schema.js';

export type EmbedKind = 'query' | 'passage';

export abstract class Embedder {
  /** Vector size. Must match the `embedding` column. */
  abstract readonly dimensions: number;
  /** Below this cosine similarity (0 to 1) a section is treated as unrelated. */
  abstract readonly minSimilarity: number;
  abstract embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Runs a small open model inside this process: no API key, no cost per call.
 * The model (about 120 MB) is downloaded on first use and cached on disk.
 *
 * multilingual-e5-small understands around 100 languages, so a question in
 * Portuguese or Spanish finds policy text written in English.
 */
export class LocalEmbedder extends Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  // E5 similarities sit in a narrow band: unrelated texts still score ~0.75.
  readonly minSimilarity: number;
  private extractor?: Promise<Extractor>;

  constructor(
    private readonly model = 'Xenova/multilingual-e5-small',
    minSimilarity = 0.8,
  ) {
    super();
    this.minSimilarity = minSimilarity;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    // E5 models are trained with these prefixes; leaving them out hurts quality.
    const output = await extractor(
      texts.map((text) => `${kind}: ${text}`),
      { pooling: 'mean', normalize: true },
    );
    return output.tolist();
  }

  private load(): Promise<Extractor> {
    this.extractor ??= import('@huggingface/transformers').then(
      ({ pipeline }) =>
        pipeline('feature-extraction', this.model) as unknown as Promise<Extractor>,
    );
    // A failed download should be retried on the next call, not cached.
    this.extractor.catch(() => (this.extractor = undefined));
    return this.extractor;
  }
}
