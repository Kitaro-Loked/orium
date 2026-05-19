/**
 * Orium - Document Service (Parsing, OCR, Extraction)
 * Unified interface for document processing APIs.
 */

export interface DocumentParseRequest {
  document: string | Buffer | File; // URL, buffer, or File
  format?: 'pdf' | 'docx' | 'txt' | 'html' | 'markdown' | 'auto';
  extractImages?: boolean;
  extractTables?: boolean;
  extractMetadata?: boolean;
  pageRange?: [number, number];
}

export interface DocumentParseResponse {
  id: string;
  text: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    images?: Array<{ url?: string; base64?: string; caption?: string }>;
    tables?: Array<{
      headers: string[];
      rows: string[][];
    }>;
  }>;
  metadata?: {
    title?: string;
    author?: string;
    pages?: number;
    language?: string;
  };
}

export interface OCRRequest {
  image: string | Buffer | File;
  language?: string; // e.g., "eng", "chi_sim", "jpn"
  model?: string;
  detectOrientation?: boolean;
}

export interface OCRResponse {
  id: string;
  text: string;
  confidence?: number;
  regions?: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
}

export interface StructuredExtractionRequest {
  document: string | Buffer | File;
  schema: Record<string, string>; // field name -> type/description
  model?: string;
}

export interface StructuredExtractionResponse {
  id: string;
  data: Record<string, unknown>;
  confidence: number;
}

export abstract class DocumentService {
  abstract readonly name: string;
  abstract readonly supportedFormats: string[];

  abstract parse(request: DocumentParseRequest): Promise<DocumentParseResponse>;
  abstract healthCheck(): Promise<boolean>;

  ocr?(request: OCRRequest): Promise<OCRResponse> {
    throw new Error('OCR not supported by this service');
  }

  extract?(request: StructuredExtractionRequest): Promise<StructuredExtractionResponse> {
    throw new Error('Structured extraction not supported by this service');
  }
}

// === Unstructured.io ===

export class UnstructuredService extends DocumentService {
  readonly name = 'unstructured';
  readonly supportedFormats = ['pdf', 'docx', 'txt', 'html', 'md', 'pptx', 'xlsx', 'csv', 'png', 'jpg'];

  private apiKey: string;
  private baseUrl = 'https://api.unstructured.io/general/v0';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async parse(request: DocumentParseRequest): Promise<DocumentParseResponse> {
    const formData = new FormData();
    formData.append('files', new Blob([request.document as BlobPart]));

    const res = await fetch(`${this.baseUrl}/general`, {
      method: 'POST',
      headers: { 'unstructured-api-key': this.apiKey },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Unstructured error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.map((el: any) => el.text).join('\n');

    return {
      id: `unstructured-${Date.now()}`,
      text,
      pages: this.groupByPage(data),
    };
  }

  private groupByPage(elements: any[]): DocumentParseResponse['pages'] {
    const pages = new Map<number, any[]>();
    for (const el of elements) {
      const pageNum = el.metadata?.page_number || 1;
      if (!pages.has(pageNum)) pages.set(pageNum, []);
      pages.get(pageNum)!.push(el);
    }

    return Array.from(pages.entries()).map(([pageNumber, els]) => ({
      pageNumber,
      text: els.map((e) => e.text).join('\n'),
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { 'unstructured-api-key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Azure Document Intelligence ===

export class AzureDocumentService extends DocumentService {
  readonly name = 'azure-document';
  readonly supportedFormats = ['pdf', 'docx', 'txt', 'png', 'jpg', 'tiff'];

  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    super();
    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async parse(request: DocumentParseRequest): Promise<DocumentParseResponse> {
    const res = await fetch(`${this.endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: request.document as any,
    });

    if (!res.ok) {
      throw new Error(`Azure Document error: ${res.status} ${await res.text()}`);
    }

    const operationLocation = res.headers.get('operation-location');
    if (!operationLocation) throw new Error('No operation location');

    // Poll for result
    const result = await this.pollResult(operationLocation);
    return {
      id: result.analyzeResult?.modelId || `azure-doc-${Date.now()}`,
      text: result.analyzeResult?.content || '',
      pages: result.analyzeResult?.pages?.map((p: any) => ({
        pageNumber: p.pageNumber,
        text: p.lines?.map((l: any) => l.content).join('\n') || '',
      })),
    };
  }

  private async pollResult(url: string): Promise<any> {
    for (let i = 0; i < 30; i++) {
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
      });
      const data = await res.json();
      if (data.status === 'succeeded') return data;
      if (data.status === 'failed') throw new Error('Analysis failed');
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Polling timeout');
  }

  async ocr(request: OCRRequest): Promise<OCRResponse> {
    const res = await fetch(`${this.endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: request.image as any,
    });

    const operationLocation = res.headers.get('operation-location')!;
    const result = await this.pollResult(operationLocation);

    return {
      id: `azure-ocr-${Date.now()}`,
      text: result.analyzeResult?.content || '',
      regions: result.analyzeResult?.pages?.[0]?.lines?.map((l: any) => ({
        text: l.content,
        bbox: l.polygon,
        confidence: l.confidence,
      })),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/formrecognizer/info`, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Google Cloud Vision ===

export class GoogleVisionService extends DocumentService {
  readonly name = 'google-vision';
  readonly supportedFormats = ['png', 'jpg', 'gif', 'bmp', 'pdf', 'tiff'];

  private apiKey: string;
  private baseUrl = 'https://vision.googleapis.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async parse(request: DocumentParseRequest): Promise<DocumentParseResponse> {
    const imageContent = typeof request.document === 'string'
      ? request.document
      : Buffer.from(request.document as any).toString('base64');

    const res = await fetch(`${this.baseUrl}/documents:annotate?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageContent },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Vision error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    return {
      id: `google-vision-${Date.now()}`,
      text: fullText,
    };
  }

  async ocr(request: OCRRequest): Promise<OCRResponse> {
    const imageContent = typeof request.image === 'string'
      ? request.image
      : Buffer.from(request.image as any).toString('base64');

    const res = await fetch(`${this.baseUrl}/images:annotate?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageContent },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: {
            languageHints: [request.language || 'en'],
          },
        }],
      }),
    });

    const data = await res.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    const pages = data.responses?.[0]?.fullTextAnnotation?.pages || [];

    return {
      id: `google-ocr-${Date.now()}`,
      text,
      regions: pages.flatMap((p: any) =>
        p.blocks?.flatMap((b: any) =>
          b.paragraphs?.map((para: any) => ({
            text: para.words?.map((w: any) => w.symbols?.map((s: any) => s.text).join('')).join(' ') || '',
            bbox: para.boundingBox?.vertices?.map((v: any) => [v.x, v.y]).flat() || [0, 0, 0, 0],
            confidence: para.confidence || 0,
          }))
        )
      ),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/images:annotate?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { source: { imageUri: 'https://example.com/test.png' } }, features: [{ type: 'LABEL_DETECTION' }] }],
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === MinerU / Marker (open source PDF parser) ===

export class MinerUService extends DocumentService {
  readonly name = 'mineru';
  readonly supportedFormats = ['pdf', 'docx', 'pptx'];

  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8000') {
    super();
    this.baseUrl = baseUrl;
  }

  async parse(request: DocumentParseRequest): Promise<DocumentParseResponse> {
    const formData = new FormData();
    formData.append('file', new Blob([request.document as BlobPart]));

    const res = await fetch(`${this.baseUrl}/parse`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`MinerU error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `mineru-${Date.now()}`,
      text: data.text || '',
      pages: data.pages?.map((p: any, i: number) => ({
        pageNumber: i + 1,
        text: p.text || '',
        images: p.images,
        tables: p.tables,
      })),
      metadata: data.metadata,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class DocumentServiceRegistry {
  private services: Map<string, DocumentService> = new Map();

  register(service: DocumentService): void {
    this.services.set(service.name, service);
  }

  get(name: string): DocumentService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const documentServices = new DocumentServiceRegistry();
