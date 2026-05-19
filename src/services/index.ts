/**
 * Orium - Services Index
 * Unified exports for all AI service categories.
 */

// Image Generation
export {
  ImageService,
  ImageServiceRegistry,
  imageServices,
  DalleService,
  MidjourneyService,
  StabilityService,
  LeonardoService,
  IdeogramService,
  RecraftService,
  PollinationsImageService,
} from './image';

// Audio (STT / TTS)
export {
  AudioService,
  AudioServiceRegistry,
  audioServices,
  OpenAIAudioService,
  AzureSpeechService,
  ElevenLabsService,
  GoogleAudioService,
  AlibabaAudioService,
} from './audio';

// Embeddings
export {
  EmbeddingService,
  EmbeddingServiceRegistry,
  embeddingServices,
  OpenAIEmbeddingService,
  CohereEmbeddingService,
  JinaEmbeddingService,
  MistralEmbeddingService,
  VertexEmbeddingService,
  BaiduEmbeddingService,
} from './embedding';

// Code
export {
  CodeService,
  CodeServiceRegistry,
  codeServices,
  CopilotCodeService,
  CodeiumCodeService,
  TabnineService,
} from './code';

// Documents (OCR / Parsing)
export {
  DocumentService,
  DocumentServiceRegistry,
  documentServices,
  UnstructuredService,
  AzureDocumentService,
  GoogleVisionService,
  MinerUService,
} from './document';

// Video Generation
export {
  VideoService,
  VideoServiceRegistry,
  videoServices,
  RunwayService,
  PikaService,
  KlingService,
  LumaService,
} from './video';

// Music Generation
export {
  MusicService,
  MusicServiceRegistry,
  musicServices,
  SunoService,
  UdioService,
  StabilityAudioService,
  MurekaService,
} from './music';

// Multimodal (Vision / Audio Understanding)
export {
  MultimodalService,
  MultimodalServiceRegistry,
  multimodalServices,
  OpenAIVisionService,
  GeminiVisionService,
  ClaudeVisionService,
  QwenVisionService,
} from './multimodal';

// RAG / Vector DB
export {
  RAGService,
  RAGServiceRegistry,
  ragServices,
  ChromaService,
  PineconeService,
  QdrantService,
  WeaviateService,
} from './rag';

// Fine-tuning
export {
  FineTuningService,
  FineTuningServiceRegistry,
  fineTuningServices,
  OpenAIFineTuningService,
  TogetherFineTuningService,
  FireworksFineTuningService,
} from './fine-tuning';
