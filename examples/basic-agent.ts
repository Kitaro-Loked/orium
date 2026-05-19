/**
 * Orium Example: Basic Agent Setup
 * Safe version - no eval()
 */

import { orium, Agent, Task } from '../src/core/orchestrator';
import { OpenAIAdapter } from '../src/adapters/openai';
import { adapters } from '../src/adapters/base';
import { tools } from '../src/tools/registry';

// Simple safe math evaluator (no eval!)
function safeMathEvaluate(expression: string): number {
  // Only allow numbers, operators, parentheses, and spaces
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
  if (sanitized !== expression.trim()) {
    throw new Error('Invalid characters in expression');
  }
  // Use Function constructor with limited scope (safer than eval)
  const fn = new Function(`return (${sanitized})`);
  const result = fn();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Invalid result');
  }
  return result;
}

// 1. Register a model adapter
const openai = new OpenAIAdapter(process.env.OPENAI_API_KEY || '');
adapters.register(openai);

// 2. Register a tool (SAFE - no eval)
tools.register(
  {
    name: 'calculator',
    description: 'Perform basic math operations (+, -, *, /)',
    parameters: [
      { name: 'expression', type: 'string', description: 'Math expression like "40 + 2"', required: true },
    ],
  },
  async (args: { expression: string }) => {
    return safeMathEvaluate(args.expression);
  }
);

// 3. Create an agent
const mathAgent: Agent = {
  id: 'math-agent',
  name: 'MathAgent',
  capabilities: ['math', 'calculation'],
  execute: async (task: Task) => {
    const payload = task.payload as Record<string, unknown>;
    const expr = String(payload.expression || '');
    const result = await tools.execute('calculator', { expression: expr });
    return {
      taskId: task.id,
      success: true,
      data: result,
      latency: 0,
    };
  },
};

// 4. Register and run
orium.registerAgent(mathAgent);
orium.start();

(async () => {
  const result = await orium.submitTask({
    id: 'task-1',
    type: 'math',
    payload: { expression: '40 + 2' },
    priority: 1,
  });
  console.log('Result:', result);
  orium.stop();
})();
