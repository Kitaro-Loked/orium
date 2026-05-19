/**
 * Orium - Skills Index
 * Unified exports for all external skill integrations.
 */

// Base
export { Skill, SkillRegistry, skillRegistry, type SkillConfig } from './base';

// Search
export { TavilySkill, type TavilySearchResult, type TavilySearchOptions } from './search/tavily';
export { SerperSkill, type SerperSearchResult } from './search/serper';

// Finance
export { EastMoneySkill, type StockQuote, type FundQuote } from './finance/eastmoney';
export { AlphaVantageSkill } from './finance/alphavantage';

// Web
export { FirecrawlSkill, type ScrapeResult, type CrawlResult } from './web/firecrawl';

// Data / Agent Platforms
export { NobanaSkill, type NobanaQueryResult, type NobanaAgentResult } from './nobana';
