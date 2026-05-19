# Orium Model Adapters

Orium supports **50+ AI providers** out of the box, with a unified interface.

## Supported Providers

### Global Cloud

| Provider | Adapter | Key Models | Env Var |
|----------|---------|-----------|---------|
| OpenAI | `OpenAIAdapter` | GPT-4o, GPT-4, GPT-3.5 | `OPENAI_API_KEY` |
| Anthropic | `AnthropicAdapter` | Claude 3.5/3 | `ANTHROPIC_API_KEY` |
| Google Gemini | `GeminiAdapter` | Gemini 2.0/1.5/1.0 | `GEMINI_API_KEY` |
| Azure OpenAI | `AzureOpenAIAdapter` | GPT-4o, GPT-4 | `AZURE_OPENAI_API_KEY` |
| Google Vertex | `VertexAdapter` | Gemini, Claude, Llama | `VERTEX_API_KEY` |
| Amazon Bedrock | `BedrockAdapter` | Claude, Llama, Titan, Mistral | `AWS_ACCESS_KEY_ID` |
| IBM Watsonx | `WatsonxAdapter` | Granite, Llama, Mixtral | `WATSONX_API_KEY` |

### Aggregators / Universal APIs

| Provider | Adapter | Coverage | Env Var |
|----------|---------|----------|---------|
| OpenRouter | `OpenRouterAdapter` | 100+ models | `OPENROUTER_API_KEY` |
| Together AI | `TogetherAdapter` | Llama, Qwen, DeepSeek | `TOGETHER_API_KEY` |
| Replicate | `ReplicateAdapter` | Any open model | `REPLICATE_API_TOKEN` |
| Fireworks | `FireworksAdapter` | Llama, Mistral, Qwen | `FIREWORKS_API_KEY` |
| Novita | `NovitaAdapter` | Llama, DeepSeek, Qwen | `NOVITA_API_KEY` |
| Groq | `GroqAdapter` | Ultra-fast Llama/Mixtral | `GROQ_API_KEY` |
| SambaNova | `SambaNovaAdapter` | Llama, Qwen, DeepSeek-R1 | `SAMBANOVA_API_KEY` |
| Cerebras | `CerebrasAdapter` | Llama on wafer-scale | `CEREBRAS_API_KEY` |
| NVIDIA NIM | `NvidiaAdapter` | Llama, Mixtral, Nemotron | `NVIDIA_API_KEY` |
| Lambda Labs | `LambdaAdapter` | Llama, Hermes, DeepSeek | `LAMBDA_API_KEY` |
| FriendliAI | `FriendliAIAdapter` | Llama, Mixtral, Qwen | `FRIENDLI_API_KEY` |
| Hyperbolic | `HyperbolicAdapter` | Llama, DeepSeek, Qwen | `HYPERBOLIC_API_KEY` |
| Chutes | `ChutesAdapter` | Decentralized GPU | `CHUTES_API_KEY` |
| Cloudflare | `CloudflareAdapter` | Llama, Mistral, Qwen | `CLOUDFLARE_API_TOKEN` |

### Chinese Providers

| Provider | Adapter | Key Models | Env Var |
|----------|---------|-----------|---------|
| 通义千问 | `QwenAdapter` | Qwen-Max/Plus/Turbo | `QWEN_API_KEY` |
| 智谱 GLM | `ZhipuAdapter` | GLM-4-Plus/Air/Flash | `ZHIPU_API_KEY` |
| Moonshot Kimi | `MoonshotAdapter` | Kimi 128k/32k/8k | `MOONSHOT_API_KEY` |
| 零一万物 | `LingyiwanwuAdapter` | Yi-Large/Turbo | `LINGYIWANWU_API_KEY` |
| MiniMax | `MiniMaxAdapter` | abab6.5s | `MINIMAX_API_KEY` |
| 百川智能 | `BaichuanAdapter` | Baichuan4/3-Turbo | `BAICHUAN_API_KEY` |
| 阶跃星辰 | `StepFunAdapter` | Step-2/1 | `STEPFUN_API_KEY` |
| 讯飞星火 | `XunfeiAdapter` | Spark 4/3.5 | `XUNFEI_API_KEY` |
| 百度文心 | `BaiduAdapter` | ERNIE 4.0/3.5 | `BAIDU_API_KEY` |
| 字节豆包 | `DoubaoAdapter` | Doubao Pro/Lite | `DOUBAO_API_KEY` |
| 腾讯混元 | `HunyuanAdapter` | Hunyuan Pro/Standard | `HUNYUAN_SECRET_ID` |
| 火山引擎 | `VolcEngineAdapter` | Doubao, DeepSeek | `VOLCENGINE_API_KEY` |
| 硅基流动 | `SiliconFlowAdapter` | DeepSeek, Qwen, Llama | `SILICONFLOW_API_KEY` |
| PPIO | `PPIOAdapter` | DeepSeek, Llama, Qwen | `PPIO_API_KEY` |

### GitHub

| Provider | Adapter | Key Models | Env Var |
|----------|---------|-----------|---------|
| GitHub Copilot | `GitHubCopilotAdapter` | GPT-4o, Claude Sonnet | `GITHUB_COPILOT_TOKEN` |
| GitHub Models | `GitHubModelsAdapter` | GPT-4o, Phi-4, Llama, DeepSeek-R1 | `GITHUB_TOKEN` |

### Relays / 中转站

| Provider | Factory | Env Var |
|----------|---------|---------|
| API2D | `relayFactories.api2d()` | `API2D_KEY` |
| OhMyGPT | `relayFactories.ohmygpt()` | `OHMYGPT_KEY` |
| AIProxy | `relayFactories.aiproxy()` | `AIPROXY_KEY` |
| CloseAI | `relayFactories.closeai()` | `CLOSEAI_KEY` |
| OneAPI | `relayFactories.oneapi(url, key)` | `ONEAPI_URL`, `ONEAPI_KEY` |
| NewAPI | `relayFactories.newapi(url, key)` | `NEWAPI_URL`, `NEWAPI_KEY` |
| VoAPI | `relayFactories.voapi()` | `VOAPI_KEY` |
| AIHub | `relayFactories.aihub()` | `AIHUB_KEY` |
| GPTAPI | `relayFactories.gptapi()` | `GPTAPI_KEY` |
| OpenAI-SB | `relayFactories.openaisb()` | `OPENAISB_KEY` |
| AIKey | `relayFactories.aikey()` | `AIKEY_KEY` |
| GoAPI | `relayFactories.goapi()` | `GOAPI_KEY` |
| APIGPT | `relayFactories.apigpt()` | `APIGPT_KEY` |
| Custom | `relayFactories.custom(name, url, key)` | `CUSTOM_RELAY_URL`, `CUSTOM_RELAY_KEY` |

### Reverse / 逆向

| Provider | Adapter | Auth |
|----------|---------|------|
| Poe | `PoeReverseAdapter` | `p-b` cookie |
| ChatGPT Web | `ChatGPTReverseAdapter` | Access token |
| Claude Web | `ClaudeReverseAdapter` | Session key |
| Bing Copilot | `BingCopilotAdapter` | Cookie |

### Free / 公益站

| Provider | Factory | Notes |
|----------|---------|-------|
| Pollinations | `freeFactories.pollinations()` | Free text & image |
| DuckDuckGo | `freeFactories.duckduckgo()` | Anonymous AI chat |
| BlackBox | `freeFactories.blackbox()` | Free multi-model |
| HuggingFace | `freeFactories.huggingfaceFree(key)` | Free inference |
| OpenRouter Free | `freeFactories.openrouterFree(key)` | Free tier models |
| Groq Free | `freeFactories.groqFree(key)` | Generous free tier |

### Enterprise / 私有化

| Provider | Factory | Use Case |
|----------|---------|----------|
| Internal | `enterpriseFactories.internal(url, key)` | Corporate proxy |
| Air-gapped | `enterpriseFactories.airgapped(url, key)` | No internet |
| mTLS | `enterpriseFactories.mtls(url, key, ca)` | Custom CA |
| Alibaba PAI | `enterpriseFactories.alibabaPai(url, token)` | Cloud deploy |
| Huawei ModelArts | `enterpriseFactories.huaweiModelArts(url, token)` | Cloud deploy |
| Baidu BML | `enterpriseFactories.baiduBml(url, key)` | Cloud deploy |
| Tencent TI-ONE | `enterpriseFactories.tencentTione(url, id, key)` | Cloud deploy |

### Proxy / 代理

| Type | Factory | Config |
|------|---------|--------|
| HTTP | `proxyFactories.http(url, key, host, port)` | HTTP proxy |
| SOCKS5 | `proxyFactories.socks5(url, key, host, port)` | SOCKS5 proxy |
| Proxy URL | `proxyFactories.proxyUrl(url, key, proxyUrl)` | Full URL |
| Clash | `proxyFactories.clash(url, key, port)` | Clash local |
| Shadowsocks | `proxyFactories.shadowsocks(url, key, port)` | SS local |
| Trojan | `proxyFactories.trojan(url, key, port)` | Trojan local |

### Local / Self-Hosted

| Provider | Factory | Usage |
|----------|---------|-------|
| Ollama | `OllamaAdapter` | Local models |
| LM Studio | `genericFactories.lmstudio()` | Local GUI server |
| vLLM | `genericFactories.vllm(url)` | High-throughput |
| SGLang | `genericFactories.sglang(url)` | Structured gen |
| llama.cpp | `genericFactories.llamacpp(url)` | C++ inference |
| TabbyAPI | `genericFactories.tabby(url, key)` | ExLlamaV2 server |
| Generic | `GenericAdapter` | Any OpenAI-compatible |

## Quick Start

### Auto-Register from Environment

```typescript
import { autoRegisterAdapters, adapters } from 'orium';

autoRegisterAdapters();
console.log(adapters.list()); // All configured providers
```

### Use Any Adapter

```typescript
const adapter = adapters.get('openai');

const response = await adapter.complete({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
});
```

### Relay / 中转站

```typescript
import { relayFactories } from 'orium';

// API2D
adapters.register(relayFactories.api2d('your-api2d-key'));

// OneAPI / NewAPI (open source relay platform)
adapters.register(relayFactories.oneapi('https://oneapi.example.com', 'key'));

// Custom relay
adapters.register(relayFactories.custom('my-relay', 'https://relay.example.com/v1', 'key'));
```

### GitHub Copilot

```typescript
import { GitHubCopilotAdapter } from 'orium';

const copilot = new GitHubCopilotAdapter('ghp_your_github_token');
adapters.register(copilot);

const res = await copilot.complete({
  messages: [{ role: 'user', content: 'Write a function' }],
});
```

### Reverse APIs

```typescript
import { PoeReverseAdapter, ChatGPTReverseAdapter } from 'orium';

// Poe
const poe = new PoeReverseAdapter('your-p-b-cookie');

// ChatGPT web
const chatgpt = new ChatGPTReverseAdapter('your-access-token');
```

### Free APIs

```typescript
import { freeFactories } from 'orium';

adapters.register(freeFactories.pollinations());
adapters.register(freeFactories.duckduckgo());
adapters.register(freeFactories.blackbox());
```

### Enterprise / 私有化

```typescript
import { enterpriseFactories } from 'orium';

// Internal deployment behind proxy
adapters.register(enterpriseFactories.internal(
  'https://ai.internal.company.com',
  'api-key',
  'http://proxy.company.com:8080'
));

// Air-gapped (no internet)
adapters.register(enterpriseFactories.airgapped(
  'https://ai.local'
));
```

### Proxy / 代理

```typescript
import { proxyFactories } from 'orium';

// SOCKS5
adapters.register(proxyFactories.socks5(
  'https://api.openai.com',
  'sk-...',
  '127.0.0.1',
  1080
));

// Clash
adapters.register(proxyFactories.clash(
  'https://api.openai.com',
  'sk-...',
  7890
));
```

### Auto-Select by Model Name

```typescript
import { getAdapterForModel } from 'orium';

getAdapterForModel('claude-3-5-sonnet');   // → Anthropic
getAdapterForModel('qwen-plus');           // → 通义千问
getAdapterForModel('deepseek-chat');       // → DeepSeek
getAdapterForModel('glm-4');               // → 智谱
getAdapterForModel('doubao-pro-32k');      // → 豆包
getAdapterForModel('copilot-chat');        // → GitHub Copilot
getAdapterForModel('phi-4');               // → GitHub Models
```

## Environment Variables

See full list in `src/adapters/index.ts` `autoRegisterAdapters()` function.

Key ones:

```bash
# Standard
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# GitHub
GITHUB_COPILOT_TOKEN=ghp_...
GITHUB_TOKEN=ghp_...

# Relays
API2D_KEY=...
ONEAPI_URL=https://...
ONEAPI_KEY=...
CUSTOM_RELAY_URL=https://...
CUSTOM_RELAY_KEY=...

# Free
ENABLE_FREE_APIS=true
HUGGINGFACE_API_KEY=...

# Enterprise
INTERNAL_API_URL=https://...
INTERNAL_API_KEY=...
INTERNAL_PROXY_URL=http://...

# Local
OLLAMA_BASE_URL=http://localhost:11434
LM_STUDIO_URL=http://localhost:1234
VLLM_URL=http://localhost:8000
```
