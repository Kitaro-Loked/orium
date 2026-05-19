/**
 * Orium - Chat Built-in Commands
 * Slash commands for the REPL chat interface.
 */

import type { ChatSession } from './session.js';
import type { ChatHistory } from './history.js';
import type { AdapterRegistry, ModelAdapter } from '../adapters/base.js';
import type { SkillRegistry } from '../skills/base.js';

export interface CommandContext {
  session: ChatSession;
  history: ChatHistory;
  sessionId: string;
  currentModel?: string;
  adapterRegistry?: AdapterRegistry;
  skillRegistry?: SkillRegistry;
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  execute(args: string[], ctx: CommandContext): Promise<string | void>;
}

export const commands: Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    execute: async () => {
      const lines = ['Available commands:'];
      for (const cmd of commands) {
        lines.push(`  ${cmd.name.padEnd(14)} ${cmd.description}`);
      }
      lines.push('\nSkills:');
      lines.push('  /skill list        List available skills');
      lines.push('  /skill on <name>   Activate a skill');
      lines.push('  /skill off <name>  Deactivate a skill');
      lines.push('\nImages:');
      lines.push('  /image <url>       Send image URL for analysis');
      return lines.join('\n');
    },
  },
  {
    name: 'model',
    description: 'Switch to a different model or adapter',
    usage: '/model <adapter> [model]',
    execute: async (args, ctx) => {
      if (!args[0]) {
        const current = ctx.session.getAdapter();
        return `Current: ${current.name}${ctx.currentModel ? ` (${ctx.currentModel})` : ''}`;
      }

      const adapterName = args[0];
      const modelName = args[1];

      if (!ctx.adapterRegistry) {
        return 'Adapter registry not available.';
      }

      const adapter = ctx.adapterRegistry.get(adapterName);
      if (!adapter) {
        const available = ctx.adapterRegistry.list().join(', ');
        return `Adapter '${adapterName}' not found. Available: ${available}`;
      }

      ctx.session.setAdapter(adapter, modelName);
      return `Switched to ${adapter.name}${modelName ? ` (${modelName})` : ''}`;
    },
  },
  {
    name: 'system',
    description: 'Set system prompt',
    usage: '/system <prompt>',
    execute: async (args, ctx) => {
      const prompt = args.join(' ');
      if (!prompt) {
        const history = ctx.session.getHistory();
        const systemMsg = history.find((m) => m.role === 'system');
        return `Current: ${systemMsg?.content || 'None'}`;
      }
      ctx.session.setSystemPrompt(prompt);
      return 'System prompt updated.';
    },
  },
  {
    name: 'clear',
    description: 'Clear conversation history',
    usage: '/clear',
    execute: async (_args, ctx) => {
      ctx.session.clearHistory();
      return 'Conversation history cleared.';
    },
  },
  {
    name: 'history',
    description: 'Show conversation history',
    usage: '/history [limit]',
    execute: async (args, ctx) => {
      const limit = parseInt(args[0], 10) || 10;
      const history = ctx.session.getHistory();
      const lines = history.slice(-limit).map((m) => {
        const prefix = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : m.role === 'tool' ? 'Tool' : 'System';
        return `[${prefix}] ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`;
      });
      return lines.join('\n') || 'No messages yet.';
    },
  },
  {
    name: 'save',
    description: 'Save current conversation',
    usage: '/save [title]',
    execute: async (args, ctx) => {
      const title = args.join(' ') || `Chat ${new Date().toLocaleString()}`;
      ctx.history.rename(ctx.sessionId, title);
      ctx.history.update(ctx.sessionId, ctx.session.getHistory());
      return `Saved as: ${title}`;
    },
  },
  {
    name: 'load',
    description: 'Load a saved conversation',
    usage: '/load <session-id>',
    execute: async (args, ctx) => {
      if (!args[0]) {
        const sessions = ctx.history.list().slice(0, 10);
        const lines = ['Recent sessions:'];
        for (const s of sessions) {
          lines.push(`  ${s.id.slice(0, 16)}...  ${s.title}  (${s.messages.length} msgs)`);
        }
        return lines.join('\n');
      }
      const entry = ctx.history.get(args[0]);
      if (!entry) return `Session not found: ${args[0]}`;
      ctx.session.import({ messages: entry.messages, options: { model: entry.model } });
      return `Loaded: ${entry.title} (${entry.messages.length} messages)`;
    },
  },
  {
    name: 'usage',
    description: 'Show token usage statistics',
    usage: '/usage',
    execute: async (_args, ctx) => {
      const usage = ctx.session.getTokenUsage();
      return `Tokens:  Prompt ${usage.prompt} | Completion ${usage.completion} | Total ${usage.total}`;
    },
  },
  {
    name: 'temp',
    description: 'Set temperature (0-2)',
    usage: '/temp <value>',
    execute: async (args) => {
      const temp = parseFloat(args[0]);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return 'Usage: /temp <0-2>';
      }
      return `Temperature set to ${temp}`;
    },
  },
  {
    name: 'skill',
    description: 'Manage skills',
    usage: '/skill <list|on|off> [name]',
    execute: async (args, ctx) => {
      if (!ctx.skillRegistry) return 'Skill system not available.';

      const subcmd = args[0] || 'list';
      const skillName = args[1];

      if (subcmd === 'list') {
        const skills = ctx.skillRegistry.list();
        const lines = ['Skills:'];
        for (const s of skills) {
          const status = s.active ? '●' : '○';
          lines.push(`  ${status} ${s.name.padEnd(12)} ${s.description}`);
        }
        return lines.join('\n');
      }

      if (subcmd === 'on' && skillName) {
        const success = await ctx.skillRegistry.activate(skillName);
        return success ? `Skill '${skillName}' activated.` : `Failed to activate '${skillName}'.`;
      }

      if (subcmd === 'off' && skillName) {
        await ctx.skillRegistry.deactivate(skillName);
        return `Skill '${skillName}' deactivated.`;
      }

      return 'Usage: /skill list | /skill on <name> | /skill off <name>';
    },
  },
  {
    name: 'image',
    description: 'Send an image URL for analysis',
    usage: '/image <url> [prompt]',
    execute: async (args, ctx) => {
      const imageUrl = args[0];
      if (!imageUrl) return 'Usage: /image <url> [prompt]';
      const prompt = args.slice(1).join(' ') || 'Describe this image.';
      await ctx.session.send(prompt, imageUrl);
      return; // Response will be printed by REPL
    },
  },
  {
    name: 'tools',
    description: 'Show available tools from active skills',
    usage: '/tools',
    execute: async (_args, ctx) => {
      if (!ctx.skillRegistry) return 'Skill system not available.';
      const tools = ctx.skillRegistry.getAllTools();
      if (tools.length === 0) return 'No active tools. Activate skills with /skill on <name>';

      const lines = ['Active tools:'];
      for (const t of tools) {
        lines.push(`  • ${t.schema.name}: ${t.schema.description}`);
      }
      return lines.join('\n');
    },
  },
  {
    name: 'exit',
    description: 'Exit chat',
    usage: '/exit',
    execute: async () => 'GOODBYE',
  },
];

export function parseCommand(input: string): { command: string; args: string[] } | null {
  if (!input.startsWith('/')) return null;

  const parts = input.slice(1).trim().split(/\s+/);
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1),
  };
}

export function findCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}
