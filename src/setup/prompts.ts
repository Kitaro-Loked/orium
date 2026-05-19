/**
 * Orium Setup Wizard - Interactive Prompts
 * Zero-dependency terminal interaction using readline.
 */

import * as readline from 'readline';

// ANSI color codes (zero dependency)
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const color = C;

export function printLogo(): void {
  console.log(`
${C.cyan}   ____  _             __  __ ${C.reset}
${C.cyan}  / __ \| |           |  \/  |${C.reset}
${C.cyan} | |  | | |_   _ _ __ | \  / |${C.reset}
${C.cyan} | |  | | | | | | '_ \| |\/| |${C.reset}
${C.cyan} | |__| | | |_| | | | | |  | |${C.reset}
${C.cyan}  \____/|_|\__, |_| |_|_|  |_|${C.reset}
${C.cyan}            __/ |             ${C.reset}
${C.cyan}           |___/              ${C.reset}
${C.dim}  The Foundational Element of Intelligence${C.reset}
`);
}

export function printWelcome(version: string): void {
  printLogo();
  console.log(`${C.bold}Welcome to Orium v${version}!${C.reset}\n`);
  console.log(`This wizard will help you set up your AI infrastructure.`);
  console.log(`You can ${C.yellow}[Skip]${C.reset} any step or ${C.yellow}[Skip All]${C.reset} remaining at any time.\n`);
}

export function printSection(title: string): void {
  console.log(`\n${C.bold}${C.blue}▸ ${title}${C.reset}`);
  console.log(`${C.gray}${'─'.repeat(50)}${C.reset}`);
}

export function printSuccess(message: string): void {
  console.log(`${C.green}✓ ${message}${C.reset}`);
}

export function printWarning(message: string): void {
  console.log(`${C.yellow}⚠ ${message}${C.reset}`);
}

export function printError(message: string): void {
  console.log(`${C.red}✗ ${message}${C.reset}`);
}

export function printInfo(message: string): void {
  console.log(`${C.gray}ℹ ${message}${C.reset}`);
}

export interface PromptOptions {
  defaultValue?: string;
  secret?: boolean;
  allowSkip?: boolean;
  allowSkipAll?: boolean;
}

export type PromptResult = { value: string } | 'skip' | 'skip-all';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function ask(
  question: string,
  options: PromptOptions = {}
): Promise<PromptResult> {
  const { defaultValue, secret, allowSkip = true, allowSkipAll = true } = options;

  const hints: string[] = [];
  if (allowSkip) hints.push(`${C.yellow}[Enter]${C.reset} to skip`);
  if (allowSkipAll) hints.push(`${C.yellow}[s]${C.reset} skip all`);
  if (defaultValue) hints.push(`${C.gray}(default: ${defaultValue})${C.reset}`);

  const hintText = hints.length > 0 ? ` ${hints.join(' | ')}` : '';
  const promptText = `${C.cyan}?${C.reset} ${question}${hintText}\n${C.bold}>${C.reset} `;

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      const trimmed = answer.trim();

      if (trimmed.toLowerCase() === 's' && allowSkipAll) {
        resolve('skip-all');
        return;
      }

      if (trimmed === '' && allowSkip) {
        if (defaultValue) {
          resolve({ value: defaultValue });
        } else {
          resolve('skip');
        }
        return;
      }

      resolve({ value: trimmed });
    });
  });
}

export async function askSecret(question: string): Promise<PromptResult> {
  const promptText = `${C.cyan}?${C.reset} ${question} ${C.gray}(input hidden)${C.reset}\n${C.bold}>${C.reset} `;

  return new Promise((resolve) => {
    // Hide input
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(promptText);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (char: string) => {
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          if (value === '') {
            resolve('skip');
          } else if (value.toLowerCase() === 's') {
            resolve('skip-all');
          } else {
            resolve({ value });
          }
          break;
        case '\u0003': // Ctrl+C
          stdin.setRawMode(false);
          stdin.pause();
          process.exit(0);
          break;
        case '\u007f': // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          break;
        default:
          value += char;
          stdout.write('*');
          break;
      }
    };

    stdin.on('data', onData);
  });
}

export async function select<T extends string>(
  question: string,
  choices: { value: T; label: string; description?: string }[],
  options: { allowSkip?: boolean } = {}
): Promise<T | 'skip'> {
  const { allowSkip = true } = options;

  console.log(`\n${C.cyan}?${C.reset} ${C.bold}${question}${C.reset}`);
  choices.forEach((c, i) => {
    const desc = c.description ? ` ${C.gray}- ${c.description}${C.reset}` : '';
    console.log(`  ${C.yellow}${i + 1}${C.reset}) ${c.label}${desc}`);
  });
  if (allowSkip) {
    console.log(`  ${C.yellow}s${C.reset}) ${C.gray}Skip this step${C.reset}`);
  }

  return new Promise((resolve) => {
    rl.question(`${C.bold}>${C.reset} `, (answer) => {
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 's' && allowSkip) {
        resolve('skip');
        return;
      }

      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx].value);
      } else {
        printWarning('Invalid choice, skipping.');
        resolve('skip');
      }
    });
  });
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? `${C.yellow}[Y/n]${C.reset}` : `${C.yellow}[y/N]${C.reset}`;
  const promptText = `${C.cyan}?${C.reset} ${question} ${hint}\n${C.bold}>${C.reset} `;

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultYes);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

export async function multiselect<T extends string>(
  question: string,
  choices: { value: T; label: string }[],
  defaults: T[] = []
): Promise<T[]> {
  console.log(`\n${C.cyan}?${C.reset} ${C.bold}${question}${C.reset}`);
  console.log(`${C.gray}Enter numbers separated by commas (e.g., 1,3,5) or 'all'${C.reset}`);

  choices.forEach((c, i) => {
    const checked = defaults.includes(c.value) ? `${C.green}[✓]${C.reset}` : `${C.gray}[ ]${C.reset}`;
    console.log(`  ${checked} ${C.yellow}${i + 1}${C.reset}) ${c.label}`);
  });

  return new Promise((resolve) => {
    rl.question(`${C.bold}>${C.reset} `, (answer) => {
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 'all') {
        resolve(choices.map((c) => c.value));
        return;
      }

      if (trimmed === '') {
        resolve(defaults);
        return;
      }

      const selected: T[] = [];
      const indices = trimmed.split(',').map((s) => parseInt(s.trim(), 10) - 1);
      for (const idx of indices) {
        if (idx >= 0 && idx < choices.length) {
          selected.push(choices[idx].value);
        }
      }
      resolve(selected);
    });
  });
}

export function closePrompts(): void {
  rl.close();
}
