import { chunkPolicy, fuseRankings } from './policy.service.js';
import { WordHashEmbedder } from './testing.js';

describe('chunkPolicy', () => {
  it('creates one chunk per section, prefixed with the document title', () => {
    const chunks = chunkPolicy('refunds.md', '# Refund policy\n\n## Window\nSeven days.\n\n## Empty\n\n## Duplicates\nRefunded.');
    expect(chunks).toEqual([
      { document: 'refunds.md', heading: 'Refund policy: Window', content: 'Seven days.' },
      { document: 'refunds.md', heading: 'Refund policy: Duplicates', content: 'Refunded.' },
    ]);
  });
});

describe('fuseRankings', () => {
  const item = (id: number) => ({ id });

  it('ranks an item found by both searches above one ranked first by only one', () => {
    const byKeyword = [item(1), item(2)];
    const byMeaning = [item(3), item(2)];
    expect(fuseRankings([byKeyword, byMeaning], 3).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('respects the limit and tolerates an empty list', () => {
    expect(fuseRankings([[item(1), item(2), item(3)], []], 2).map((i) => i.id)).toEqual([1, 2]);
  });
});

describe('WordHashEmbedder', () => {
  it('gives similar vectors to texts that share words', async () => {
    const embedder = new WordHashEmbedder();
    const [refund, sameTopic, other] = await embedder.embed(
      ['refund for a duplicate charge', 'duplicate charge refund', 'offline downloads on four screens'],
    );
    const similarity = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

    expect(refund).toHaveLength(embedder.dimensions);
    expect(similarity(refund, sameTopic)).toBeGreaterThan(0.7);
    expect(similarity(refund, other)).toBeLessThan(embedder.minSimilarity);
  });
});
