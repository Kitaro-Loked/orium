/**
 * Orium - Main Entry Point
 */

// Core Engine
export { orium, Orchestrator, Agent, Task, Result } from './core/orchestrator';
export { router, SmartRouter, RoutingStrategy, AdapterMetrics } from './core/router';
export { tokenPools, TokenPool, TokenPoolRegistry, TokenConfig } from './core/token-pool';
export { configLoader, ConfigLoader, OriumConfig } from './core/config-loader';

// Adapter Base
export {
  adapters,
  AdapterRegistry,
  ModelAdapter,
  CompletionRequest,
  CompletionResponse,
  Message,
  ToolDefinition,
  ToolCall,
} from './adapters/base';

// All Chat Adapters
export {
  // Standard cloud
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  OllamaAdapter,
  AzureOpenAIAdapter,
  OpenRouterAdapter,
  DeepSeekAdapter,
  CohereAdapter,
  MistralAdapter,
  GroqAdapter,
  TogetherAdapter,
  QwenAdapter,
  ZhipuAdapter,
  MoonshotAdapter,
  PerplexityAdapter,
  AI21Adapter,
  ReplicateAdapter,
  FireworksAdapter,
  NovitaAdapter,
  SiliconFlowAdapter,
  LingyiwanwuAdapter,
  MiniMaxAdapter,
  BaichuanAdapter,
  StepFunAdapter,
  XunfeiAdapter,
  BaiduAdapter,
  DoubaoAdapter,
  HunyuanAdapter,
  BedrockAdapter,
  CloudflareAdapter,
  VertexAdapter,
  WatsonxAdapter,
  NvidiaAdapter,
  SambaNovaAdapter,
  CerebrasAdapter,
  FriendliAIAdapter,
  HyperbolicAdapter,
  LambdaAdapter,
  ChutesAdapter,
  PPIOAdapter,
  VolcEngineAdapter,

  // Generic
  GenericAdapter,
  genericFactories,

  // GitHub
  GitHubCopilotAdapter,
  GitHubModelsAdapter,

  // IDE / Editor
  CursorAdapter,
  WindsurfAdapter,
  CodeiumAdapter,
  ContinueAdapter,
  AiderAdapter,
  JetBrainsAdapter,

  // Relays
  RelayAdapter,
  relayFactories,

  // Reverse
  PoeReverseAdapter,
  ChatGPTReverseAdapter,
  ClaudeReverseAdapter,
  BingCopilotAdapter,

  // Free
  FreeAdapter,
  freeFactories,

  // Enterprise
  EnterpriseAdapter,
  enterpriseFactories,

  // Proxy
  ProxyAdapter,
  proxyFactories,

  // Utils
  autoRegisterAdapters,
  getAdapterForModel,
} from './adapters/index';

// Services
export * from './services/index';

// Memory
export { memory, MemoryStore, MemoryEntry } from './memory/store';

// Tools
export { tools, ToolRegistry, ToolSchema, ToolHandler } from './tools/registry';

// Runtime
export {
  getPlatformInfo,
  isNode,
  isBrowser,
  isEdge,
  PlatformInfo,
  Runtime,
} from './runtime/compat';
