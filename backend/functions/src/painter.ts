import OpenAI, { toFile } from 'openai';
import type { TokenUsage } from './credits';
import { ModelError } from './model';

// An image model behind one call: a reference picture and a prompt in, a transparent PNG out, with the tokens it cost.

export interface Painting { png: Buffer; usage: TokenUsage; model: string }
export interface PaintRequest { prompt: string; reference: Buffer; signal?: AbortSignal }
export interface ImageModel { readonly id: string; paint(request: PaintRequest): Promise<Painting> }

export const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

export class OpenAIImageModel implements ImageModel {
  private readonly client: OpenAI;
  constructor(apiKey: string, readonly id = DEFAULT_IMAGE_MODEL) { this.client = new OpenAI({ apiKey }); }

  async paint(request: PaintRequest): Promise<Painting> {
    try {
      const response = await this.client.images.edit({
        model: this.id,
        image: await toFile(request.reference, 'reference.png', { type: 'image/png' }),
        prompt: request.prompt,
        background: 'transparent', output_format: 'png', size: '1024x1024', quality: 'high',
        // Only the full model takes the fidelity switch; it is what keeps the character's identity.
        ...(this.id === 'gpt-image-1' ? { input_fidelity: 'high' as const } : {}),
      }, { signal: request.signal });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new ModelError('failed', 'The image model returned no picture.');
      const usage = response.usage;
      return { png: Buffer.from(b64, 'base64'), model: this.id, usage: { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0, cacheRead: 0, cacheWrite: 0 } };
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) throw new ModelError('busy', error.message);
      if (error instanceof OpenAI.APIError) throw new ModelError('failed', `${error.status ?? 'error'}: ${error.message}`);
      throw error;
    }
  }
}
