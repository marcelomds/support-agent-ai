import { EMBEDDING_DIMENSIONS } from '../db/schema.js';
import { Embedder } from './embedder.js';

/**
 * Deterministic stand-in for the embedding model, for tests.
 * Each word adds weight to one position, so texts sharing words get similar
 * vectors. It has no notion of meaning; it only exercises the pipeline.
 */
export class WordHashEmbedder extends Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly minSimilarity = 0.2;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = Array.from({ length: this.dimensions }, () => 0);
      for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
        let hash = 0;
        for (const char of word) hash = (hash * 31 + char.codePointAt(0)!) % this.dimensions;
        vector[hash] += 1;
      }
      const length = Math.hypot(...vector) || 1;
      return vector.map((value) => value / length);
    });
  }
}
