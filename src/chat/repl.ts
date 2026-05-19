/**
 * Orium - Chat REPL
 * Interactive command-line chat interface with tool calling.
 */

import * as readline from 'readline';
import type { ModelAdapter, AdapterRegistry } from '../adapters/base';
import { ChatSession } from './session';
import { ChatHistory } from './history';
import { parseCommand, findCommand } from './commands';
import type { CommandContext } from './commands';
import type { SkillRegistry } from '../skills/base';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

export interface ReplOptions {
  adapter: ModelAdapter;
  model?: string;
  systemPrompt?: string;
  multiline?: boolean;
  adapterRegistry?: AdapterRegistry;
  skillRegistry?: SkillRegistry;
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { adapter, model, systemPrompt, adapterRegistry, skillRegistry } = options;

  const session = new ChatSession(adapter, {
    model,
    systemPrompt: systemPrompt || 'You are a helpful assistant.',
  }, skillRegistry);

  const history = new ChatHistory();
  const sessionId = history.create('REPL Chat');

  const ctx: CommandContext = {
    session,
    history,
    sessionId,
    currentModel: model,
    adapterRegistry,
    skillRegistry,
  };

  console.log(`\n${C.cyan}${C.bold}Orium Chat${C.reset} ${C.gray}- Type /help for commands${C.reset}\n`);
  console.log(`${C.gray}Adapter: ${adapter.name}${model ? ` | Model: ${model}` : ''}${C.reset}`);
  if (skillRegistry) {
    const activeSkills = skillRegistry.list().filter((s) => s.active);
    if (activeSkills.length > 0) {
      console.log(`${C.gray}Skills: ${activeSkills.map((s) => s.name).join(', ')}${C.reset}`);
    }
  }
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.green}You${C.reset}> `,
  });

  let multilineBuffer: string[] = [];
  let isMultiline = false;

  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    if (isMultiline) {
      if (trimmed === '```') {
        isMultiline = false;
        const fullInput = multilineBuffer.join('\n');
        multilineBuffer = [];
        await handleInput(fullInput, ctx, rl);
      } else {
        multilineBuffer.push(input);
        rl.setPrompt(`${C.gray}...${C.reset}> `);
      }
      rl.prompt();
      return;
    }

    if (trimmed === '```') {
      isMultiline = true;
      multilineBuffer = [];
      rl.setPrompt(`${C.gray}...${C.reset}> `);
      rl.prompt();
      return;
    }

    if (!trimmed) {
      rl.prompt();
      return;
    }

    await handleInput(trimmed, ctx, rl);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.gray}Goodbye!${C.reset}\n`);
    history.update(sessionId, session.getHistory());
    process.exit(0);
  });

  return new Promise(() => {});
}

async function handleInput(
  input: string,
  ctx: CommandContext,
  rl: readline.Interface
): Promise<void> {
  const cmd = parseCommand(input);
  if (cmd) {
    const command = findCommand(cmd.command);
    if (command) {
      try {
        const result = await command.execute(cmd.args, ctx);
        if (result === 'GOODBYE') {
          rl.close();
          return;
        }
        if (result) {
          console.log(`${C.cyan}${C.bold}System${C.reset}> ${result}`);
        }
      } catch (err) {
        console.log(`${C.red}Error: ${err}${C.reset}`);
      }
      return;
    }
    console.log(`${C.cyan}${C.bold}System${C.reset}> Unknown command: /${cmd.command}`);
    return;
  }

  // Regular message
  try {
    process.stdout.write(`${C.yellow}${C.bold}AI${C.reset}> `);

    const response = await ctx.session.send(input);

    // Print response
    console.log(response.content);

    // Print tool calls if any
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        console.log(`${C.magenta}[Tool] ${tc.name}${C.reset}`);
      }
    }

    // Print tool results
    const toolResults = ctx.session.getToolResults();
    const newResults = toolResults.slice(-(response.toolCalls?.length || 0));
    for (const tr of newResults) {
      const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result).slice(0, 200);
      console.log(`${C.gray}[Result] ${tr.name}: ${resultStr}${C.reset}`);
    }

    ctx.history.update(ctx.sessionId, ctx.session.getHistory());
  } catch (err) {
    console.log(`\n${C.red}Error: ${err}${C.reset}`);
  }
}
