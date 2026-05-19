/**
 * Orium Example: Basic Agent Setup
 */

import { orium, Agent, Task } from '../src/core/orchestrator';
import { OpenAIAdapter } from '../src/adapters/openai';
import { adapters } from '../src/adapters/base';
import { tools } from '../src/tools/registry';

// 1. Register a model adapter
const openai = new OpenAIAdapter(process.env.OPENAI_API_KEY || '');
adapters.register(openai);

// 2. Register a tool
tools.register(
  {
    name: 'calculator',
    description: 'Perform basic math',
    parameters: [
      { name: 'expression', type: 'string', description: 'Math expression', required: true },
    ],
  },
  async (args) => {
    // In production, use a proper math parser
    return eval(args.expression as string);
  }
);

// 3. Create an agent
const mathAgent: Agent = {
  id: 'math-agent',
  name: 'MathAgent',
  capabilities: ['math', 'calculation'],
  execute: async (task: Task) => {
    const expr = (task.payload as any).expression;
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
