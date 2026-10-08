/**
 * ==========================================
 * RETRIEVAL-AUGMENTED GENERATION (RAG) - retrieval step
 * ==========================================
 *
 * WHAT IT IS:
 * RAG = first RETRIEVE trusted documents, then let the language model GENERATE an answer
 * grounded in them. It reduces made-up facts because the model works from our own sources.
 *
 * IN BIOFRESH-CV:
 * - Knowledge base: 16 curated documents in src/lib/ragKnowledge.ts (recipes, storage advice,
 *   nutrition, composting/upcycling), each tagged with produce type and a freshness range.
 * - Retrieval: documents are scored by produce match, freshness range and category, and the
 *   top results are returned (keyword/metadata retrieval, not vector embeddings).
 * - Generation: GenerativeAI.ts puts the retrieved documents into the Gemini prompt as [S1], [S2]...
 *   and the Kitchen Rescue Agent (AgenticAI.ts) can call this retrieval as its search_knowledge tool.
 */
import { queryRAGKnowledgeBase, KNOWLEDGE_CORPUS, type KnowledgeDocument } from "../lib/ragKnowledge";

export type KnowledgeCategory = KnowledgeDocument["category"];

/** Top `limit` knowledge-base documents for a produce item at a given freshness (0..1). */
export function retrieveKnowledge(produceType: string, quality: number, category?: KnowledgeCategory, limit = 3): KnowledgeDocument[] {
  return queryRAGKnowledgeBase(produceType, quality, category, limit);
}

export const KNOWLEDGE_BASE_SIZE = KNOWLEDGE_CORPUS.length;
