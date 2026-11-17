-- pgvector adds the "vector" column type and similarity search to Postgres.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "policy_chunks" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
CREATE INDEX "policy_chunks_embedding_idx" ON "policy_chunks" USING hnsw ("embedding" vector_cosine_ops);