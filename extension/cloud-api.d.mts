export function retryTranslationRequest<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T>;
