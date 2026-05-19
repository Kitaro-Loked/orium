import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adapters,
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  OllamaAdapter,
  DeepSeekAdapter,
  PerplexityAdapter,
  AI21Adapter,
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
  QwenAdapter,
  ZhipuAdapter,
  MoonshotAdapter,
  CohereAdapter,
  MistralAdapter,
  GroqAdapter,
  GenericAdapter,
  genericFactories,
  GitHubCopilotAdapter,
  GitHubModelsAdapter,
  CursorAdapter,
  WindsurfAdapter,
  CodeiumAdapter,
  ContinueAdapter,
  AiderAdapter,
  JetBrainsAdapter,
  RelayAdapter,
  relayFactories,
  PoeReverseAdapter,
  ChatGPTReverseAdapter,
  ClaudeReverseAdapter,
  BingCopilotAdapter,
  FreeAdapter,
  freeFactories,
  EnterpriseAdapter,
  enterpriseFactories,
  ProxyAdapter,
  proxyFactories,
  autoRegisterAdapters,
  getAdapterForModel,
} from '../src/adapters/index';

describe('Adapter Registry', () => {
  it('registers and lists adapters', () => {
    const openai = new OpenAIAdapter('fake-key');
    adapters.register(openai);
    expect(adapters.list()).toContain('openai');
  });

  it('retrieves adapter by name', () => {
    const adapter = adapters.get('openai');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe('openai');
  });
});

describe('Standard Adapters', () => {
  it('OpenAI', () => { const a = new OpenAIAdapter('fake'); expect(a.name).toBe('openai'); });
  it('Anthropic', () => { const a = new AnthropicAdapter('fake'); expect(a.name).toBe('anthropic'); });
  it('Gemini', () => { const a = new GeminiAdapter('fake'); expect(a.name).toBe('gemini'); });
  it('Ollama', () => { const a = new OllamaAdapter(); expect(a.name).toBe('ollama'); });
  it('DeepSeek', () => { const a = new DeepSeekAdapter('fake'); expect(a.name).toBe('deepseek'); });
  it('Perplexity', () => { const a = new PerplexityAdapter('fake'); expect(a.name).toBe('perplexity'); });
  it('AI21', () => { const a = new AI21Adapter('fake'); expect(a.name).toBe('ai21'); });
  it('Fireworks', () => { const a = new FireworksAdapter('fake'); expect(a.name).toBe('fireworks'); });
  it('Novita', () => { const a = new NovitaAdapter('fake'); expect(a.name).toBe('novita'); });
  it('SiliconFlow', () => { const a = new SiliconFlowAdapter('fake'); expect(a.name).toBe('siliconflow'); });
  it('01.AI', () => { const a = new LingyiwanwuAdapter('fake'); expect(a.name).toBe('lingyiwanwu'); });
  it('MiniMax', () => { const a = new MiniMaxAdapter('fake', 'g'); expect(a.name).toBe('minimax'); });
  it('Baichuan', () => { const a = new BaichuanAdapter('fake'); expect(a.name).toBe('baichuan'); });
  it('StepFun', () => { const a = new StepFunAdapter('fake'); expect(a.name).toBe('stepfun'); });
  it('Xunfei', () => { const a = new XunfeiAdapter('app', 'key', 'secret'); expect(a.name).toBe('xunfei'); });
  it('Baidu', () => { const a = new BaiduAdapter('k', 's'); expect(a.name).toBe('baidu'); });
  it('Doubao', () => { const a = new DoubaoAdapter('fake'); expect(a.name).toBe('doubao'); });
  it('Hunyuan', () => { const a = new HunyuanAdapter('i', 'k'); expect(a.name).toBe('hunyuan'); });
  it('Bedrock', () => { const a = new BedrockAdapter('key', 'secret'); expect(a.name).toBe('bedrock'); });
  it('Cloudflare', () => { const a = new CloudflareAdapter('token', 'account'); expect(a.name).toBe('cloudflare'); });
  it('Vertex', () => { const a = new VertexAdapter('key', 'project'); expect(a.name).toBe('vertex'); });
  it('Watsonx', () => { const a = new WatsonxAdapter('key', 'project'); expect(a.name).toBe('watsonx'); });
  it('NVIDIA', () => { const a = new NvidiaAdapter('fake'); expect(a.name).toBe('nvidia'); });
  it('SambaNova', () => { const a = new SambaNovaAdapter('fake'); expect(a.name).toBe('sambanova'); });
  it('Cerebras', () => { const a = new CerebrasAdapter('fake'); expect(a.name).toBe('cerebras'); });
  it('FriendliAI', () => { const a = new FriendliAIAdapter('fake'); expect(a.name).toBe('friendliai'); });
  it('Hyperbolic', () => { const a = new HyperbolicAdapter('fake'); expect(a.name).toBe('hyperbolic'); });
  it('Lambda', () => { const a = new LambdaAdapter('fake'); expect(a.name).toBe('lambda'); });
  it('Chutes', () => { const a = new ChutesAdapter('fake'); expect(a.name).toBe('chutes'); });
  it('PPIO', () => { const a = new PPIOAdapter('fake'); expect(a.name).toBe('ppio'); });
  it('VolcEngine', () => { const a = new VolcEngineAdapter('fake'); expect(a.name).toBe('volcengine'); });
  it('Generic', () => { const a = new GenericAdapter('custom', 'https://api.example.com/v1', 'fake'); expect(a.name).toBe('custom'); });
  it('Generic LM Studio', () => { const a = genericFactories.lmstudio(); expect(a.name).toBe('lmstudio'); });
  it('Generic vLLM', () => { const a = genericFactories.vllm('http://localhost:8000'); expect(a.name).toBe('vllm'); });
});

describe('GitHub Adapters', () => {
  it('GitHub Copilot', () => { const a = new GitHubCopilotAdapter('ghp_token'); expect(a.name).toBe('github-copilot'); });
  it('GitHub Models', () => { const a = new GitHubModelsAdapter('ghp_token'); expect(a.name).toBe('github-models'); });
});

describe('IDE Adapters', () => {
  it('Cursor', () => { const a = new CursorAdapter('token'); expect(a.name).toBe('cursor'); });
  it('Windsurf', () => { const a = new WindsurfAdapter('key'); expect(a.name).toBe('windsurf'); });
  it('Codeium', () => { const a = new CodeiumAdapter('key'); expect(a.name).toBe('codeium'); });
  it('Continue', () => { const a = new ContinueAdapter(); expect(a.name).toBe('continue'); });
  it('Aider', () => { const a = new AiderAdapter(); expect(a.name).toBe('aider'); });
  it('JetBrains', () => { const a = new JetBrainsAdapter('token'); expect(a.name).toBe('jetbrains'); });
});

describe('Relay Adapters', () => {
  it('Relay generic', () => { const a = new RelayAdapter({ name: 'my-relay', baseUrl: 'https://relay.example.com', apiKey: 'fake' }); expect(a.name).toBe('my-relay'); });
  it('API2D factory', () => { const a = relayFactories.api2d('fake'); expect(a.name).toBe('api2d'); });
  it('OneAPI factory', () => { const a = relayFactories.oneapi('https://oneapi.example.com', 'fake'); expect(a.name).toBe('oneapi'); });
  it('Custom relay', () => { const a = relayFactories.custom('my-relay', 'https://relay.example.com', 'fake'); expect(a.name).toBe('my-relay'); });
});

describe('Reverse Adapters', () => {
  it('Poe Reverse', () => { const a = new PoeReverseAdapter('poe_token'); expect(a.name).toBe('poe-reverse'); });
  it('ChatGPT Reverse', () => { const a = new ChatGPTReverseAdapter('access_token'); expect(a.name).toBe('chatgpt-reverse'); });
  it('Claude Reverse', () => { const a = new ClaudeReverseAdapter('session_key'); expect(a.name).toBe('claude-reverse'); });
  it('Bing Copilot', () => { const a = new BingCopilotAdapter('cookie'); expect(a.name).toBe('bing-copilot'); });
});

describe('Free Adapters', () => {
  it('Free generic', () => { const a = new FreeAdapter({ name: 'free-api', baseUrl: 'https://free.example.com' }); expect(a.name).toBe('free-api'); });
  it('Pollinations', () => { const a = freeFactories.pollinations(); expect(a.name).toBe('pollinations'); });
  it('DuckDuckGo', () => { const a = freeFactories.duckduckgo(); expect(a.name).toBe('duckduckgo'); });
  it('BlackBox', () => { const a = freeFactories.blackbox(); expect(a.name).toBe('blackbox'); });
});

describe('Enterprise Adapters', () => {
  it('Enterprise generic', () => { const a = new EnterpriseAdapter({ name: 'internal', baseUrl: 'https://internal.example.com', apiKey: 'fake' }); expect(a.name).toBe('internal'); });
  it('Internal factory', () => { const a = enterpriseFactories.internal('https://internal.example.com'); expect(a.name).toBe('internal'); });
  it('Airgapped', () => { const a = enterpriseFactories.airgapped('https://airgap.example.com'); expect(a.name).toBe('airgapped'); });
});

describe('Proxy Adapters', () => {
  it('Proxy generic', () => { const a = new ProxyAdapter({ name: 'my-proxy', baseUrl: 'https://api.example.com', apiKey: 'fake' }); expect(a.name).toBe('my-proxy'); });
  it('SOCKS5', () => { const a = proxyFactories.socks5('https://api.example.com', 'fake', '127.0.0.1', 1080); expect(a.name).toBe('socks5-proxy'); });
  it('Clash', () => { const a = proxyFactories.clash('https://api.example.com', 'fake'); expect(a.name).toBe('clash'); });
  it('Shadowsocks', () => { const a = proxyFactories.shadowsocks('https://api.example.com', 'fake'); expect(a.name).toBe('shadowsocks'); });
});

describe('getAdapterForModel', () => {
  beforeEach(() => {
    adapters.register(new OpenAIAdapter('fake'));
    adapters.register(new AnthropicAdapter('fake'));
    adapters.register(new GeminiAdapter('fake'));
    adapters.register(new DeepSeekAdapter('fake'));
    adapters.register(new QwenAdapter('fake'));
    adapters.register(new ZhipuAdapter('fake'));
    adapters.register(new MoonshotAdapter('fake'));
    adapters.register(new LingyiwanwuAdapter('fake'));
    adapters.register(new MiniMaxAdapter('fake', 'g'));
    adapters.register(new BaichuanAdapter('fake'));
    adapters.register(new StepFunAdapter('fake'));
    adapters.register(new BaiduAdapter('k', 's'));
    adapters.register(new DoubaoAdapter('fake'));
    adapters.register(new HunyuanAdapter('i', 'k'));
    adapters.register(new PerplexityAdapter('fake'));
    adapters.register(new AI21Adapter('fake'));
    adapters.register(new CohereAdapter('fake'));
    adapters.register(new MistralAdapter('fake'));
    adapters.register(new GroqAdapter('fake'));
    adapters.register(new OllamaAdapter());
    adapters.register(new GitHubCopilotAdapter('token'));
    adapters.register(new GitHubModelsAdapter('token'));
    adapters.register(new CursorAdapter('token'));
    adapters.register(new JetBrainsAdapter('token'));
  });

  it('finds by exact match', () => {
    expect(getAdapterForModel('gpt-4o')?.name).toBe('openai');
    expect(getAdapterForModel('claude-3-5-sonnet')?.name).toBe('anthropic');
  });

  it('finds by prefix', () => {
    expect(getAdapterForModel('gemini-1.5')?.name).toBe('gemini');
    expect(getAdapterForModel('deepseek-chat')?.name).toBe('deepseek');
    expect(getAdapterForModel('qwen-plus')?.name).toBe('qwen');
    expect(getAdapterForModel('glm-4')?.name).toBe('zhipu');
    expect(getAdapterForModel('moonshot-v1')?.name).toBe('moonshot');
    expect(getAdapterForModel('yi-large')?.name).toBe('lingyiwanwu');
    expect(getAdapterForModel('abab6')?.name).toBe('minimax');
    expect(getAdapterForModel('Baichuan4')?.name).toBe('baichuan');
    expect(getAdapterForModel('step-1')?.name).toBe('stepfun');
    expect(getAdapterForModel('ernie-4')?.name).toBe('baidu');
    expect(getAdapterForModel('doubao-pro')?.name).toBe('doubao');
    expect(getAdapterForModel('hunyuan-pro')?.name).toBe('hunyuan');
    expect(getAdapterForModel('sonar-pro')?.name).toBe('perplexity');
    expect(getAdapterForModel('jamba-1.5')?.name).toBe('ai21');
    expect(getAdapterForModel('command-r')?.name).toBe('cohere');
    expect(getAdapterForModel('mistral-large')?.name).toBe('mistral');
    expect(getAdapterForModel('llama-3.1')?.name).toBe('groq');
    expect(getAdapterForModel('copilot-chat')?.name).toBe('github-copilot');
    expect(getAdapterForModel('phi-4')?.name).toBe('github-models');
    expect(getAdapterForModel('cursor-fast')?.name).toBe('cursor');
    expect(getAdapterForModel('jb-gpt-4o')?.name).toBe('jetbrains');
  });

  it('returns undefined for unknown', () => {
    expect(getAdapterForModel('unknown-model-v99')).toBeUndefined();
  });
});

describe('autoRegisterAdapters', () => {
  it('registers standard adapters', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('OLLAMA_AUTO_DETECT', 'false');

    autoRegisterAdapters();

    expect(adapters.list()).toContain('openai');
    expect(adapters.list()).toContain('anthropic');

    vi.unstubAllEnvs();
  });

  it('registers GitHub adapters', () => {
    vi.stubEnv('GITHUB_COPILOT_TOKEN', 'ghp_test');
    vi.stubEnv('OLLAMA_AUTO_DETECT', 'false');

    autoRegisterAdapters();

    expect(adapters.list()).toContain('github-copilot');

    vi.unstubAllEnvs();
  });

  it('registers IDE adapters', () => {
    vi.stubEnv('CURSOR_TOKEN', 'token');
    vi.stubEnv('WINDSUF_API_KEY', 'key');
    vi.stubEnv('CODEIUM_API_KEY', 'key');
    vi.stubEnv('OLLAMA_AUTO_DETECT', 'false');

    autoRegisterAdapters();

    expect(adapters.list()).toContain('cursor');
    expect(adapters.list()).toContain('windsurf');
    expect(adapters.list()).toContain('codeium');

    vi.unstubAllEnvs();
  });

  it('registers relay adapters', () => {
    vi.stubEnv('API2D_KEY', 'test');
    vi.stubEnv('ONEAPI_URL', 'https://oneapi.example.com');
    vi.stubEnv('ONEAPI_KEY', 'test');
    vi.stubEnv('OLLAMA_AUTO_DETECT', 'false');

    autoRegisterAdapters();

    expect(adapters.list()).toContain('api2d');
    expect(adapters.list()).toContain('oneapi');

    vi.unstubAllEnvs();
  });
});
