/**
 * ==========================================
 * AGENTIC AI (Autonomous Agents)
 * ==========================================
 * 
 * WHAT IT IS:
 * Agentic AI goes beyond simple prompt-response generation. An "Agent" is an AI 
 * system that is given a GOAL, and can autonomously perceive its environment, 
 * plan a sequence of steps, use external TOOLS (like APIs, calculators, or databases), 
 * and take ACTIONS to achieve that goal.
 * 
 * HOW IT WORKS (ReAct Loop):
 * Many agents use a "Reasoning and Acting" (ReAct) loop:
 * 1. THOUGHT: The agent thinks about what to do next based on the goal.
 * 2. ACTION: The agent decides to use a specific tool (e.g., fetchWeather()).
 * 3. OBSERVATION: The agent observes the tool's output.
 * 4. Repeat until the goal is achieved.
 * 
 * DIFFERENCE FROM GEN-AI:
 * Gen-AI generates static text. Agentic AI executes workflows, interacts with the 
 * real world, and can correct its own mistakes.
 * 
 * USE CASE IN BIOFRESH-CV:
 * An autonomous fridge monitor agent that continuously checks temperature APIs, 
 * realizes the fridge is too warm, calculates which food will spoil first, and 
 * autonomously texts the user an alert with a rescue recipe.
 */

export class ProduceRescueAgent {
  private agentId: string;
  private tools: string[];

  constructor() {
    this.agentId = "BioFresh-Rescue-Agent-001";
    this.tools = ["CheckThermometerAPI", "QueryDatabase", "SendNotification"];
  }

  /**
   * Simulates an autonomous reasoning loop to rescue spoiling food.
   */
  public async executeRescueMission(produceId: string, currentTemp: number): Promise<void> {
    console.log(`\n[Agent ${this.agentId}] Goal: Prevent food waste for item ${produceId}.`);
    
    // Step 1: THOUGHT
    console.log(`[Agent] THOUGHT: I need to check if the current temperature (${currentTemp}°C) is safe.`);
    
    if (currentTemp > 10) {
      // Step 2: ACTION (Using a Tool)
      console.log(`[Agent] ACTION: Temperature is dangerously high. Using tool [QueryDatabase] to check produce type.`);
      
      // Step 3: OBSERVATION (Simulated tool result)
      const produceType = "Leafy Greens";
      console.log(`[Agent] OBSERVATION: Item is ${produceType}, which wilts rapidly > 10°C.`);
      
      // Step 4: THOUGHT & NEXT ACTION
      console.log(`[Agent] THOUGHT: The greens will spoil in 12 hours. I must alert the user immediately.`);
      console.log(`[Agent] ACTION: Using tool [SendNotification] to alert user.`);
      
      this.sendAlert(produceType, "Move to cooler shelf immediately to prevent wilting.");
      
      console.log(`[Agent] FINAL: Goal achieved. User alerted. Terminating loop.\n`);
    } else {
      console.log(`[Agent] THOUGHT: Temperature is safe. No action required.`);
    }
  }

  private sendAlert(item: string, message: string) {
    console.log(`>> [SYSTEM NOTIFICATION]: Alert for ${item}: ${message} <<`);
  }
}
