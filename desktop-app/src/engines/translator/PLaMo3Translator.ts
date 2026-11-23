import { PLAMO_3_VARIANTS } from '../model-downloader'
import { LlamaWorkerTranslator, type GGUFVariantConfig } from './LlamaWorkerTranslator'
import type { WorkerInitOptions } from '../../main/worker-pool'

export class PLaMo3Translator extends LlamaWorkerTranslator {
  readonly id = 'plamo-3'
  readonly name = 'PLaMo 3 Translate 0.8B'

  protected getVariants(): Record<string, GGUFVariantConfig> {
    return PLAMO_3_VARIANTS
  }

  protected getModelSizeLabel(): string {
    return this.name
  }

  protected getExtraInitOptions(): Partial<WorkerInitOptions> {
    return { modelType: 'plamo-3' }
  }
}
