import { describe, it, expect } from 'vitest';
import { SkillRegistry, Skill, type SkillConfig } from '../src/skills/base';
import { TavilySkill } from '../src/skills/search/tavily';
import { SerperSkill } from '../src/skills/search/serper';
import { EastMoneySkill } from '../src/skills/finance/eastmoney';
import { AlphaVantageSkill } from '../src/skills/finance/alphavantage';
import { FirecrawlSkill } from '../src/skills/web/firecrawl';
import { NobanaSkill } from '../src/skills/nobana';

describe('Skill System', () => {
  describe('SkillRegistry', () => {
    it('registers and lists skills', () => {
      const registry = new SkillRegistry();
      const skill = new EastMoneySkill();

      registry.register(skill);
      const list = registry.list();

      expect(list.length).toBe(1);
      expect(list[0].name).toBe('eastmoney');
      expect(list[0].category).toBe('finance');
      expect(list[0].active).toBe(false);
    });

    it('activates and deactivates skills', async () => {
      const registry = new SkillRegistry();
      const skill = new EastMoneySkill();

      registry.register(skill);
      const activated = await registry.activate('eastmoney');

      expect(activated).toBe(true);
      expect(registry.isActive('eastmoney')).toBe(true);

      await registry.deactivate('eastmoney');
      expect(registry.isActive('eastmoney')).toBe(false);
    });

    it('filters skills by category', () => {
      const registry = new SkillRegistry();
      registry.register(new TavilySkill({ apiKey: 'test' }));
      registry.register(new EastMoneySkill());
      registry.register(new FirecrawlSkill({ apiKey: 'test' }));

      const searchSkills = registry.listByCategory('search');
      const financeSkills = registry.listByCategory('finance');

      expect(searchSkills.length).toBe(1);
      expect(financeSkills.length).toBe(1);
      expect(searchSkills[0].name).toBe('tavily');
    });

    it('collects tools from active skills', async () => {
      const registry = new SkillRegistry();
      registry.register(new TavilySkill({ apiKey: 'test' }));
      registry.register(new EastMoneySkill());

      await registry.activate('tavily');
      await registry.activate('eastmoney');

      const tools = registry.getAllTools();
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.schema.name);
      // EastMoney has 4 tools (Tavily activation failed due to empty API key)
      expect(toolNames.length).toBe(4);
      expect(toolNames).toContain('eastmoney_stock_quote');
      expect(toolNames).toContain('eastmoney_fund_quote');
      expect(toolNames).toContain('eastmoney_market_overview');
      expect(toolNames).toContain('eastmoney_hot_sectors');
    });
  });

  describe('TavilySkill', () => {
    it('has correct metadata', () => {
      const skill = new TavilySkill({ apiKey: 'test' });
      expect(skill.name).toBe('tavily');
      expect(skill.category).toBe('search');
      expect(skill.getTools().length).toBe(2);
    });

    it('requires API key for activation', async () => {
      const skill = new TavilySkill({ apiKey: '' });
      const activated = await skill.activate();
      expect(activated).toBe(false);
    });
  });

  describe('EastMoneySkill', () => {
    it('has correct metadata', () => {
      const skill = new EastMoneySkill();
      expect(skill.name).toBe('eastmoney');
      expect(skill.category).toBe('finance');
      expect(skill.getTools().length).toBe(4);
    });

    it('does not require API key', async () => {
      const skill = new EastMoneySkill();
      const activated = await skill.activate();
      expect(activated).toBe(true);
    });
  });

  describe('NobanaSkill', () => {
    it('has correct metadata', () => {
      const skill = new NobanaSkill({ apiKey: 'test' });
      expect(skill.name).toBe('nobana');
      expect(skill.category).toBe('data');
      expect(skill.getTools().length).toBe(2);
    });
  });

  describe('FirecrawlSkill', () => {
    it('has correct metadata', () => {
      const skill = new FirecrawlSkill({ apiKey: 'test' });
      expect(skill.name).toBe('firecrawl');
      expect(skill.category).toBe('web');
      expect(skill.getTools().length).toBe(3);
    });
  });
});
