/**
 * Orium - Skill Base Interface
 * Universal skill system for external integrations.
 */

import type { ToolSchema, ToolHandler } from '../tools/registry';

export interface SkillConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  options?: Record<string, unknown>;
}

export abstract class Skill {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: 'search' | 'finance' | 'web' | 'code' | 'data' | 'custom';

  protected config: SkillConfig;

  constructor(config: SkillConfig = { enabled: true }) {
    this.config = config;
  }

  /**
   * Get the tools this skill provides.
   */
  abstract getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }>;

  /**
   * Activate the skill (validate config, test connectivity).
   */
  abstract activate(): Promise<boolean>;

  /**
   * Deactivate the skill.
   */
  abstract deactivate(): Promise<void>;

  /**
   * Health check - verify the skill is functional.
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<SkillConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): SkillConfig {
    return { ...this.config };
  }
}

export interface SkillRegistryEntry {
  skill: Skill;
  active: boolean;
}

export class SkillRegistry {
  private skills: Map<string, SkillRegistryEntry> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.name, { skill, active: false });
  }

  unregister(name: string): void {
    this.skills.delete(name);
  }

  async activate(name: string): Promise<boolean> {
    const entry = this.skills.get(name);
    if (!entry) throw new Error(`Skill not found: ${name}`);

    const success = await entry.skill.activate();
    entry.active = success;
    return success;
  }

  async deactivate(name: string): Promise<void> {
    const entry = this.skills.get(name);
    if (!entry) return;

    await entry.skill.deactivate();
    entry.active = false;
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)?.skill;
  }

  isActive(name: string): boolean {
    return this.skills.get(name)?.active || false;
  }

  list(): Array<{ name: string; description: string; category: string; active: boolean }> {
    return Array.from(this.skills.entries()).map(([name, entry]) => ({
      name,
      description: entry.skill.description,
      category: entry.skill.category,
      active: entry.active,
    }));
  }

  listByCategory(category: string): Skill[] {
    return Array.from(this.skills.values())
      .filter((entry) => entry.skill.category === category)
      .map((entry) => entry.skill);
  }

  getAllTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const tools: Array<{ schema: ToolSchema; handler: ToolHandler }> = [];
    for (const entry of this.skills.values()) {
      if (entry.active) {
        tools.push(...entry.skill.getTools());
      }
    }
    return tools;
  }

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, entry] of this.skills) {
      if (entry.active) {
        results[name] = await entry.skill.healthCheck();
      }
    }
    return results;
  }
}

export const skillRegistry = new SkillRegistry();
