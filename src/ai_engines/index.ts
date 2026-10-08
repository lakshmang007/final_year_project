/**
 * AI Engines (SERVER ONLY - imported by server.ts, never by the browser app)
 *
 *   PredictiveAI.ts  Computer vision model (ONNX) + Arrhenius shelf-life prediction
 *   RAGModel.ts      Retrieval over the BioFresh knowledge base
 *   GenerativeAI.ts  Gemini writes a personalised rescue plan, grounded in retrieved documents (RAG)
 *   AgenticAI.ts     Kitchen Rescue Agent: Gemini plans and calls tools in a loop to reach a goal
 *   tools.ts         The tools the agent can call (inventory, shelf life, knowledge, weather, reminders)
 *   llm.ts           Gemini connection and automatic model selection (GEMINI_API_KEY)
 */
export * from "./PredictiveAI";
export * from "./RAGModel";
export * from "./GenerativeAI";
export * from "./AgenticAI";
export { llmStatus } from "./llm";
