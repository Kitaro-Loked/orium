/**
 * Orium - Audio Service (Speech Recognition & Synthesis)
 * Unified interface for Whisper, TTS, and other audio APIs.
 */

// === Speech Recognition (STT) ===

export interface TranscriptionRequest {
  audio: string | Buffer | File; // URL, base64, buffer, or File
  model?: string;
  language?: string; // e.g., "zh", "en", "ja"
  prompt?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
  timestampGranularities?: ('word' | 'segment')[];
}

export interface TranscriptionResponse {
  id: string;
  text: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>;
  language?: string;
  duration?: number;
}

export interface TranslationRequest {
  audio: string | Buffer | File;
  model?: string;
  prompt?: string;
  responseFormat?: string;
  temperature?: number;
}

// === Speech Synthesis (TTS) ===

export interface SpeechRequest {
  text: string;
  model?: string;
  voice?: string; // e.g., "alloy", "echo", "fable", "onyx", "nova", "shimmer"
  speed?: number;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  language?: string;
  emotion?: string; // for emotion-capable TTS
  pitch?: number;
  volume?: number;
}

export interface SpeechResponse {
  id: string;
  audio: ArrayBuffer;
  format: string;
  duration?: number;
}

export abstract class AudioService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  // STT
  abstract transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;

  // TTS
  abstract speak(request: SpeechRequest): Promise<SpeechResponse>;

  translate?(request: TranslationRequest): Promise<TranscriptionResponse> {
    throw new Error('Translation not supported by this service');
  }

  abstract healthCheck(): Promise<boolean>;
}

// === OpenAI Whisper / TTS ===

export class OpenAIAudioService extends AudioService {
  readonly name = 'openai-audio';
  readonly supportedModels = ['whisper-1', 'tts-1', 'tts-1-hd'];

  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append('file', new Blob([request.audio as BlobPart]));
    formData.append('model', request.model || 'whisper-1');
    if (request.language) formData.append('language', request.language);
    if (request.prompt) formData.append('prompt', request.prompt);
    if (request.responseFormat) formData.append('response_format', request.responseFormat);
    if (request.temperature !== undefined) formData.append('temperature', String(request.temperature));

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Whisper error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `whisper-${Date.now()}`,
      text: data.text,
      segments: data.segments,
      language: data.language,
      duration: data.duration,
    };
  }

  async translate(request: TranslationRequest): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append('file', new Blob([request.audio as BlobPart]));
    formData.append('model', request.model || 'whisper-1');

    const res = await fetch(`${this.baseUrl}/audio/translations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    const data = await res.json();
    return {
      id: `whisper-trans-${Date.now()}`,
      text: data.text,
    };
  }

  async speak(request: SpeechRequest): Promise<SpeechResponse> {
    const res = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'tts-1',
        input: request.text,
        voice: request.voice || 'alloy',
        speed: request.speed || 1.0,
        response_format: request.responseFormat || 'mp3',
      }),
    });

    if (!res.ok) {
      throw new Error(`TTS error: ${res.status} ${await res.text()}`);
    }

    const audio = await res.arrayBuffer();
    return {
      id: `tts-${Date.now()}`,
      audio,
      format: request.responseFormat || 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Azure Speech Service ===

export class AzureSpeechService extends AudioService {
  readonly name = 'azure-speech';
  readonly supportedModels = ['azure-stt', 'azure-tts'];

  private apiKey: string;
  private region: string;
  private baseUrl: string;

  constructor(apiKey: string, region = 'eastus') {
    super();
    this.apiKey = apiKey;
    this.region = region;
    this.baseUrl = `https://${region}.stt.speech.microsoft.com`;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const res = await fetch(`${this.baseUrl}/speech/recognition/conversation/cognitiveservices/v1?language=${request.language || 'zh-CN'}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'audio/wav',
      },
      body: request.audio as BodyInit,
    });

    if (!res.ok) {
      throw new Error(`Azure STT error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `azure-stt-${Date.now()}`,
      text: data.DisplayText || data.text || '',
    };
  }

  async speak(request: SpeechRequest): Promise<SpeechResponse> {
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${request.language || 'zh-CN'}">
      <voice name="${request.voice || 'zh-CN-XiaoxiaoNeural'}">
        <prosody rate="${((request.speed || 1) * 100)}%" pitch="${request.pitch || 0}%">
          ${request.text}
        </prosody>
      </voice>
    </speak>`;

    const res = await fetch(`https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!res.ok) {
      throw new Error(`Azure TTS error: ${res.status} ${await res.text()}`);
    }

    const audio = await res.arrayBuffer();
    return {
      id: `azure-tts-${Date.now()}`,
      audio,
      format: 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/status`, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === ElevenLabs ===

export class ElevenLabsService extends AudioService {
  readonly name = 'elevenlabs';
  readonly supportedModels = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_monolingual_v1'];

  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async transcribe(): Promise<TranscriptionResponse> {
    throw new Error('ElevenLabs does not support speech recognition');
  }

  async speak(request: SpeechRequest): Promise<SpeechResponse> {
    const voiceId = request.voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    const res = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: request.text,
        model_id: request.model || 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`);
    }

    const audio = await res.arrayBuffer();
    return {
      id: `elevenlabs-${Date.now()}`,
      audio,
      format: request.responseFormat || 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        headers: { 'xi-api-key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Google Cloud Speech-to-Text / Text-to-Speech ===

export class GoogleAudioService extends AudioService {
  readonly name = 'google-audio';
  readonly supportedModels = ['google-stt', 'google-tts'];

  private apiKey: string;
  private baseUrl = 'https://texttospeech.googleapis.com/v1';
  private sttUrl = 'https://speech.googleapis.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const audioContent = typeof request.audio === 'string'
      ? request.audio
      : Buffer.from(request.audio as any).toString('base64');

    const res = await fetch(`${this.sttUrl}/speech:recognize?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          languageCode: request.language || 'zh-CN',
          model: 'latest_long',
        },
        audio: { content: audioContent },
      }),
    });

    if (!res.ok) {
      throw new Error(`Google STT error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const result = data.results?.[0];
    return {
      id: `google-stt-${Date.now()}`,
      text: result?.alternatives?.[0]?.transcript || '',
    };
  }

  async speak(request: SpeechRequest): Promise<SpeechResponse> {
    const res = await fetch(`${this.baseUrl}/text:synthesize?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: request.text },
        voice: {
          languageCode: request.language || 'zh-CN',
          name: request.voice || 'zh-CN-Wavenet-A',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: request.speed || 1.0,
          pitch: request.pitch || 0,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Google TTS error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const audio = Buffer.from(data.audioContent, 'base64');
    return {
      id: `google-tts-${Date.now()}`,
      audio: audio.buffer.slice(0) as ArrayBuffer,
      format: 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/voices?key=${this.apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Alibaba (通义听悟) ===

export class AlibabaAudioService extends AudioService {
  readonly name = 'alibaba-audio';
  readonly supportedModels = ['paraformer-realtime-v2', 'sambert-zhichu-v1'];

  private apiKey: string;
  private baseUrl = 'https://dashscope.aliyuncs.com/api/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const res = await fetch(`${this.baseUrl}/services/audio/asr/transcription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'paraformer-realtime-v2',
        input: {
          urls: [request.audio],
        },
        parameters: {
          language_hint: request.language || 'zh',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Alibaba STT error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.output?.task_id || `alibaba-stt-${Date.now()}`,
      text: data.output?.results?.[0]?.transcription || '',
    };
  }

  async speak(request: SpeechRequest): Promise<SpeechResponse> {
    const res = await fetch(`${this.baseUrl}/services/audio/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'sambert-zhichu-v1',
        input: { text: request.text },
        voice: request.voice || 'zhichu',
        parameters: {
          sample_rate: 48000,
          format: 'mp3',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Alibaba TTS error: ${res.status} ${await res.text()}`);
    }

    const audio = await res.arrayBuffer();
    return {
      id: `alibaba-tts-${Date.now()}`,
      audio,
      format: 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class AudioServiceRegistry {
  private services: Map<string, AudioService> = new Map();

  register(service: AudioService): void {
    this.services.set(service.name, service);
  }

  get(name: string): AudioService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const audioServices = new AudioServiceRegistry();
