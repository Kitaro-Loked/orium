/**
 * Orium - Adapter Index
 * Unified exports and auto-discovery for all model adapters.
 */

export {
  ModelAdapter,
  AdapterRegistry,
  CompletionRequest,
  CompletionResponse,
  Message,
  ToolDefinition,
  ToolCall,
  adapters,
} from './base';

// Standard cloud + aggregators + Chinese + other
export { OpenAIAdapter } from './openai';
export { AnthropicAdapter } from './anthropic';
export { GeminiAdapter } from './gemini';
export { OllamaAdapter } from './ollama';
export { AzureOpenAIAdapter } from './azure';
export { OpenRouterAdapter } from './openrouter';
export { DeepSeekAdapter } from './deepseek';
export { CohereAdapter } from './cohere';
export { MistralAdapter } from './mistral';
export { GroqAdapter } from './groq';
export { TogetherAdapter } from './together';
export { QwenAdapter } from './qwen';
export { ZhipuAdapter } from './zhipu';
export { MoonshotAdapter } from './moonshot';
export { PerplexityAdapter } from './perplexity';
export { AI21Adapter } from './ai21';
export { ReplicateAdapter } from './replicate';
export { FireworksAdapter } from './fireworks';
export { NovitaAdapter } from './novita';
export { SiliconFlowAdapter } from './siliconflow';
export { LingyiwanwuAdapter } from './lingyiwanwu';
export { MiniMaxAdapter } from './minimax';
export { BaichuanAdapter } from './baichuan';
export { StepFunAdapter } from './stepfun';
export { XunfeiAdapter } from './xunfei';
export { BaiduAdapter } from './baidu';
export { DoubaoAdapter } from './doubao';
export { HunyuanAdapter } from './hunyuan';
export { BedrockAdapter } from './bedrock';
export { CloudflareAdapter } from './cloudflare';
export { VertexAdapter } from './vertex';
export { WatsonxAdapter } from './watsonx';
export { NvidiaAdapter } from './nvidia';
export { SambaNovaAdapter } from './sambanova';
export { CerebrasAdapter } from './cerebras';
export { FriendliAIAdapter } from './friendliai';
export { HyperbolicAdapter } from './hyperbolic';
export { LambdaAdapter } from './lambda';
export { ChutesAdapter } from './chutes';
export { PPIOAdapter } from './ppio';
export { VolcEngineAdapter } from './volcengine';

// Generic
export { GenericAdapter, genericFactories } from './generic';

// GitHub
export { GitHubCopilotAdapter } from './github-copilot';
export { GitHubModelsAdapter } from './github-models';

// IDE / Editor integrations
export { CursorAdapter } from './cursor';
export { WindsurfAdapter } from './windsurf';
export { CodeiumAdapter } from './codeium';
export { ContinueAdapter } from './continue';
export { AiderAdapter } from './aider';
export { JetBrainsAdapter } from './jetbrains';

// Relays
export { RelayAdapter, relayFactories } from './relay';

// Reverse
export {
  PoeReverseAdapter,
  ChatGPTReverseAdapter,
  ClaudeReverseAdapter,
  BingCopilotAdapter,
} from './reverse';

// Free
export { FreeAdapter, freeFactories } from './free';

// Enterprise
export { EnterpriseAdapter, enterpriseFactories } from './enterprise';

// Proxy
export { ProxyAdapter, proxyFactories } from './proxy';

// Imports for auto-register
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { OllamaAdapter } from './ollama';
import { AzureOpenAIAdapter } from './azure';
import { OpenRouterAdapter } from './openrouter';
import { DeepSeekAdapter } from './deepseek';
import { CohereAdapter } from './cohere';
import { MistralAdapter } from './mistral';
import { GroqAdapter } from './groq';
import { TogetherAdapter } from './together';
import { QwenAdapter } from './qwen';
import { ZhipuAdapter } from './zhipu';
import { MoonshotAdapter } from './moonshot';
import { PerplexityAdapter } from './perplexity';
import { AI21Adapter } from './ai21';
import { ReplicateAdapter } from './replicate';
import { FireworksAdapter } from './fireworks';
import { NovitaAdapter } from './novita';
import { SiliconFlowAdapter } from './siliconflow';
import { LingyiwanwuAdapter } from './lingyiwanwu';
import { MiniMaxAdapter } from './minimax';
import { BaichuanAdapter } from './baichuan';
import { StepFunAdapter } from './stepfun';
import { XunfeiAdapter } from './xunfei';
import { BaiduAdapter } from './baidu';
import { DoubaoAdapter } from './doubao';
import { HunyuanAdapter } from './hunyuan';
import { BedrockAdapter } from './bedrock';
import { CloudflareAdapter } from './cloudflare';
import { VertexAdapter } from './vertex';
import { WatsonxAdapter } from './watsonx';
import { NvidiaAdapter } from './nvidia';
import { SambaNovaAdapter } from './sambanova';
import { CerebrasAdapter } from './cerebras';
import { FriendliAIAdapter } from './friendliai';
import { HyperbolicAdapter } from './hyperbolic';
import { LambdaAdapter } from './lambda';
import { ChutesAdapter } from './chutes';
import { PPIOAdapter } from './ppio';
import { VolcEngineAdapter } from './volcengine';
import { GenericAdapter, genericFactories } from './generic';
import { GitHubCopilotAdapter } from './github-copilot';
import { GitHubModelsAdapter } from './github-models';
import { CursorAdapter } from './cursor';
import { WindsurfAdapter } from './windsurf';
import { CodeiumAdapter } from './codeium';
import { ContinueAdapter } from './continue';
import { AiderAdapter } from './aider';
import { JetBrainsAdapter } from './jetbrains';
import { RelayAdapter, relayFactories } from './relay';
import { FreeAdapter, freeFactories } from './free';
import { EnterpriseAdapter, enterpriseFactories } from './enterprise';
import { ProxyAdapter, proxyFactories } from './proxy';
import { adapters } from './base';

/**
 * Auto-register all available adapters from environment variables.
 */
export function autoRegisterAdapters(registry?: import('./base').AdapterRegistry, config?: any): void {
  const target = registry || adapters;
  // === Standard Cloud ===
  if (process.env.OPENAI_API_KEY) {
    adapters.register(new OpenAIAdapter(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    adapters.register(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_BASE_URL));
  }
  if (process.env.GEMINI_API_KEY) {
    adapters.register(new GeminiAdapter(process.env.GEMINI_API_KEY));
  }
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_AUTO_DETECT !== 'false') {
    adapters.register(new OllamaAdapter(process.env.OLLAMA_BASE_URL));
  }
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    adapters.register(new AzureOpenAIAdapter(
      process.env.AZURE_OPENAI_API_KEY,
      process.env.AZURE_OPENAI_ENDPOINT,
      process.env.AZURE_OPENAI_API_VERSION
    ));
  }
  if (process.env.OPENROUTER_API_KEY) {
    adapters.register(new OpenRouterAdapter(process.env.OPENROUTER_API_KEY));
  }
  if (process.env.DEEPSEEK_API_KEY) {
    adapters.register(new DeepSeekAdapter(process.env.DEEPSEEK_API_KEY));
  }
  if (process.env.COHERE_API_KEY) {
    adapters.register(new CohereAdapter(process.env.COHERE_API_KEY));
  }
  if (process.env.MISTRAL_API_KEY) {
    adapters.register(new MistralAdapter(process.env.MISTRAL_API_KEY));
  }
  if (process.env.GROQ_API_KEY) {
    adapters.register(new GroqAdapter(process.env.GROQ_API_KEY));
  }
  if (process.env.TOGETHER_API_KEY) {
    adapters.register(new TogetherAdapter(process.env.TOGETHER_API_KEY));
  }
  if (process.env.QWEN_API_KEY) {
    adapters.register(new QwenAdapter(process.env.QWEN_API_KEY));
  }
  if (process.env.ZHIPU_API_KEY) {
    adapters.register(new ZhipuAdapter(process.env.ZHIPU_API_KEY));
  }
  if (process.env.MOONSHOT_API_KEY) {
    adapters.register(new MoonshotAdapter(process.env.MOONSHOT_API_KEY));
  }
  if (process.env.PERPLEXITY_API_KEY) {
    adapters.register(new PerplexityAdapter(process.env.PERPLEXITY_API_KEY));
  }
  if (process.env.AI21_API_KEY) {
    adapters.register(new AI21Adapter(process.env.AI21_API_KEY));
  }
  if (process.env.REPLICATE_API_TOKEN) {
    adapters.register(new ReplicateAdapter(process.env.REPLICATE_API_TOKEN));
  }
  if (process.env.FIREWORKS_API_KEY) {
    adapters.register(new FireworksAdapter(process.env.FIREWORKS_API_KEY));
  }
  if (process.env.NOVITA_API_KEY) {
    adapters.register(new NovitaAdapter(process.env.NOVITA_API_KEY));
  }
  if (process.env.SILICONFLOW_API_KEY) {
    adapters.register(new SiliconFlowAdapter(process.env.SILICONFLOW_API_KEY));
  }
  if (process.env.LINGYIWANWU_API_KEY) {
    adapters.register(new LingyiwanwuAdapter(process.env.LINGYIWANWU_API_KEY));
  }
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID) {
    adapters.register(new MiniMaxAdapter(process.env.MINIMAX_API_KEY, process.env.MINIMAX_GROUP_ID));
  }
  if (process.env.BAICHUAN_API_KEY) {
    adapters.register(new BaichuanAdapter(process.env.BAICHUAN_API_KEY));
  }
  if (process.env.STEPFUN_API_KEY) {
    adapters.register(new StepFunAdapter(process.env.STEPFUN_API_KEY));
  }
  if (process.env.XUNFEI_APP_ID && process.env.XUNFEI_API_KEY && process.env.XUNFEI_API_SECRET) {
    adapters.register(new XunfeiAdapter(
      process.env.XUNFEI_APP_ID,
      process.env.XUNFEI_API_KEY,
      process.env.XUNFEI_API_SECRET
    ));
  }
  if (process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY) {
    adapters.register(new BaiduAdapter(process.env.BAIDU_API_KEY, process.env.BAIDU_SECRET_KEY));
  }
  if (process.env.DOUBAO_API_KEY) {
    adapters.register(new DoubaoAdapter(process.env.DOUBAO_API_KEY));
  }
  if (process.env.HUNYUAN_SECRET_ID && process.env.HUNYUAN_SECRET_KEY) {
    adapters.register(new HunyuanAdapter(process.env.HUNYUAN_SECRET_ID, process.env.HUNYUAN_SECRET_KEY));
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    adapters.register(new BedrockAdapter(
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
      process.env.AWS_REGION
    ));
  }
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    adapters.register(new CloudflareAdapter(process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID));
  }
  if (process.env.VERTEX_API_KEY && process.env.VERTEX_PROJECT_ID) {
    adapters.register(new VertexAdapter(
      process.env.VERTEX_API_KEY,
      process.env.VERTEX_PROJECT_ID,
      process.env.VERTEX_LOCATION
    ));
  }
  if (process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID) {
    adapters.register(new WatsonxAdapter(
      process.env.WATSONX_API_KEY,
      process.env.WATSONX_PROJECT_ID,
      process.env.WATSONX_BASE_URL
    ));
  }
  if (process.env.NVIDIA_API_KEY) {
    adapters.register(new NvidiaAdapter(process.env.NVIDIA_API_KEY));
  }
  if (process.env.SAMBANOVA_API_KEY) {
    adapters.register(new SambaNovaAdapter(process.env.SAMBANOVA_API_KEY));
  }
  if (process.env.CEREBRAS_API_KEY) {
    adapters.register(new CerebrasAdapter(process.env.CEREBRAS_API_KEY));
  }
  if (process.env.FRIENDLI_API_KEY) {
    adapters.register(new FriendliAIAdapter(process.env.FRIENDLI_API_KEY));
  }
  if (process.env.HYPERBOLIC_API_KEY) {
    adapters.register(new HyperbolicAdapter(process.env.HYPERBOLIC_API_KEY));
  }
  if (process.env.LAMBDA_API_KEY) {
    adapters.register(new LambdaAdapter(process.env.LAMBDA_API_KEY));
  }
  if (process.env.CHUTES_API_KEY) {
    adapters.register(new ChutesAdapter(process.env.CHUTES_API_KEY));
  }
  if (process.env.PPIO_API_KEY) {
    adapters.register(new PPIOAdapter(process.env.PPIO_API_KEY));
  }
  if (process.env.VOLCENGINE_API_KEY) {
    adapters.register(new VolcEngineAdapter(process.env.VOLCENGINE_API_KEY, process.env.VOLCENGINE_BASE_URL));
  }

  // === GitHub ===
  if (process.env.GITHUB_COPILOT_TOKEN) {
    adapters.register(new GitHubCopilotAdapter(process.env.GITHUB_COPILOT_TOKEN));
  }
  if (process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN) {
    adapters.register(new GitHubModelsAdapter(process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN!));
  }

  // === IDE Integrations ===
  if (process.env.CURSOR_TOKEN) {
    adapters.register(new CursorAdapter(process.env.CURSOR_TOKEN));
  }
  if (process.env.WINDSUF_API_KEY) {
    adapters.register(new WindsurfAdapter(process.env.WINDSUF_API_KEY));
  }
  if (process.env.CODEIUM_API_KEY) {
    adapters.register(new CodeiumAdapter(process.env.CODEIUM_API_KEY));
  }
  if (process.env.CONTINUE_SERVER_URL) {
    adapters.register(new ContinueAdapter({ serverUrl: process.env.CONTINUE_SERVER_URL }));
  }
  if (process.env.AIDER_OPENAI_KEY || process.env.AIDER_ANTHROPIC_KEY) {
    adapters.register(new AiderAdapter({
      openaiKey: process.env.AIDER_OPENAI_KEY,
      anthropicKey: process.env.AIDER_ANTHROPIC_KEY,
      geminiKey: process.env.AIDER_GEMINI_KEY,
      deepseekKey: process.env.AIDER_DEEPSEEK_KEY,
    }));
  }
  if (process.env.JETBRAINS_AI_TOKEN) {
    adapters.register(new JetBrainsAdapter(process.env.JETBRAINS_AI_TOKEN));
  }

  // === Relays ===
  if (process.env.API2D_KEY) {
    adapters.register(relayFactories.api2d(process.env.API2D_KEY));
  }
  if (process.env.OHMYGPT_KEY) {
    adapters.register(relayFactories.ohmygpt(process.env.OHMYGPT_KEY));
  }
  if (process.env.AIPROXY_KEY) {
    adapters.register(relayFactories.aiproxy(process.env.AIPROXY_KEY));
  }
  if (process.env.CLOSEAI_KEY) {
    adapters.register(relayFactories.closeai(process.env.CLOSEAI_KEY));
  }
  if (process.env.ONEAPI_URL && process.env.ONEAPI_KEY) {
    adapters.register(relayFactories.oneapi(process.env.ONEAPI_URL, process.env.ONEAPI_KEY));
  }
  if (process.env.NEWAPI_URL && process.env.NEWAPI_KEY) {
    adapters.register(relayFactories.newapi(process.env.NEWAPI_URL, process.env.NEWAPI_KEY));
  }
  if (process.env.VOAPI_KEY) {
    adapters.register(relayFactories.voapi(process.env.VOAPI_KEY));
  }
  if (process.env.AIHUB_KEY) {
    adapters.register(relayFactories.aihub(process.env.AIHUB_KEY));
  }
  if (process.env.GPTAPI_KEY) {
    adapters.register(relayFactories.gptapi(process.env.GPTAPI_KEY));
  }
  if (process.env.OPENAISB_KEY) {
    adapters.register(relayFactories.openaisb(process.env.OPENAISB_KEY));
  }
  if (process.env.AIKEY_KEY) {
    adapters.register(relayFactories.aikey(process.env.AIKEY_KEY));
  }
  if (process.env.GOAPI_KEY) {
    adapters.register(relayFactories.goapi(process.env.GOAPI_KEY));
  }
  if (process.env.APIGPT_KEY) {
    adapters.register(relayFactories.apigpt(process.env.APIGPT_KEY));
  }
  if (process.env.CUSTOM_RELAY_URL && process.env.CUSTOM_RELAY_KEY) {
    adapters.register(relayFactories.custom('custom-relay', process.env.CUSTOM_RELAY_URL, process.env.CUSTOM_RELAY_KEY));
  }

  // === Free ===
  if (process.env.ENABLE_FREE_APIS === 'true') {
    adapters.register(freeFactories.pollinations());
    adapters.register(freeFactories.duckduckgo());
    adapters.register(freeFactories.blackbox());
  }
  if (process.env.HUGGINGFACE_API_KEY) {
    adapters.register(freeFactories.huggingfaceFree(process.env.HUGGINGFACE_API_KEY));
  }
  if (process.env.OPENROUTER_FREE_KEY) {
    adapters.register(freeFactories.openrouterFree(process.env.OPENROUTER_FREE_KEY));
  }

  // === Enterprise ===
  if (process.env.INTERNAL_API_URL) {
    adapters.register(enterpriseFactories.internal(
      process.env.INTERNAL_API_URL,
      process.env.INTERNAL_API_KEY,
      process.env.INTERNAL_PROXY_URL
    ));
  }

  // === Local ===
  if (process.env.LM_STUDIO_URL) {
    adapters.register(genericFactories.lmstudio(process.env.LM_STUDIO_URL));
  }
  if (process.env.VLLM_URL) {
    adapters.register(genericFactories.vllm(process.env.VLLM_URL));
  }
  if (process.env.SGLANG_URL) {
    adapters.register(genericFactories.sglang(process.env.SGLANG_URL));
  }
  if (process.env.LLAMACPP_URL) {
    adapters.register(genericFactories.llamacpp(process.env.LLAMACPP_URL));
  }
  if (process.env.TABBY_API_URL && process.env.TABBY_API_KEY) {
    adapters.register(genericFactories.tabby(process.env.TABBY_API_URL, process.env.TABBY_API_KEY));
  }
  if (process.env.ANYSCALE_API_KEY) {
    adapters.register(genericFactories.anyscale(process.env.ANYSCALE_API_KEY));
  }
  if (process.env.PREDIBASE_API_KEY) {
    adapters.register(genericFactories.predibase(process.env.PREDIBASE_API_KEY));
  }
}

/**
 * Get adapter by model name pattern.
 */
export function getAdapterForModel(model: string) {
  const all = adapters.list();
  for (const name of all) {
    const adapter = adapters.get(name);
    if (adapter?.supportedModels.includes(model)) {
      return adapter;
    }
  }

  // Fallback: infer from model prefix
  const lower = model.toLowerCase();
  if (lower.startsWith('gpt')) return adapters.get('openai');
  if (lower.startsWith('claude')) return adapters.get('anthropic');
  if (lower.startsWith('gemini')) return adapters.get('gemini');
  if (lower.startsWith('qwen')) return adapters.get('qwen');
  if (lower.startsWith('glm')) return adapters.get('zhipu');
  if (lower.startsWith('moonshot')) return adapters.get('moonshot');
  if (lower.startsWith('deepseek')) return adapters.get('deepseek');
  if (lower.startsWith('yi-')) return adapters.get('lingyiwanwu');
  if (lower.startsWith('abab')) return adapters.get('minimax');
  if (lower.startsWith('baichuan')) return adapters.get('baichuan');
  if (lower.startsWith('step-')) return adapters.get('stepfun');
  if (lower.startsWith('general')) return adapters.get('xunfei');
  if (lower.startsWith('ernie')) return adapters.get('baidu');
  if (lower.startsWith('doubao')) return adapters.get('doubao') || adapters.get('volcengine');
  if (lower.startsWith('hunyuan')) return adapters.get('hunyuan');
  if (lower.startsWith('sonar')) return adapters.get('perplexity');
  if (lower.startsWith('jamba')) return adapters.get('ai21');
  if (lower.startsWith('command')) return adapters.get('cohere');
  if (lower.startsWith('mistral') || lower.startsWith('pixtral')) return adapters.get('mistral');
  if (lower.startsWith('llama') || lower.startsWith('mixtral')) {
    return adapters.get('groq') || adapters.get('together') || adapters.get('ollama')
      || adapters.get('fireworks') || adapters.get('nvidia') || adapters.get('sambanova')
      || adapters.get('cerebras') || adapters.get('hyperbolic') || adapters.get('lambda');
  }
  if (lower.startsWith('meta-llama')) return adapters.get('together') || adapters.get('novita');
  if (lower.startsWith('granite')) return adapters.get('watsonx');
  if (lower.startsWith('copilot')) return adapters.get('github-copilot');
  if (lower.startsWith('phi')) return adapters.get('github-models');
  if (lower.startsWith('cursor')) return adapters.get('cursor');
  if (lower.startsWith('windsurf')) return adapters.get('windsurf');
  if (lower.startsWith('codeium')) return adapters.get('codeium');
  if (lower.startsWith('jb-')) return adapters.get('jetbrains');

  return undefined;
}
