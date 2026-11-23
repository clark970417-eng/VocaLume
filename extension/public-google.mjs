import { RetryableTranslationError, translationHttpError } from './cloud-api.mjs';

/** Shared transport for the extension's public Google Translate service. */
export async function requestPublicGoogle(text, from, to, signal) {
  const language = code => code === 'zh' ? 'zh-TW' : code;
  const query = new URLSearchParams({
    client: 'gtx', sl: language(from), tl: language(to), dt: 't', q: text
  });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`, { signal })
    .catch(error => {
      if (signal?.aborted) throw error;
      throw new RetryableTranslationError('暫時無法連線到翻譯服務');
    });
  if (!response.ok) throw translationHttpError(response, `翻譯服務 ${response.status}`);
  const data = await response.json().catch(() => {
    throw new RetryableTranslationError('翻譯服務回傳格式不正確');
  });
  if (!Array.isArray(data?.[0])) throw new RetryableTranslationError('翻譯服務回傳格式不正確');
  const result = data[0]
    .map(segment => typeof segment?.[0] === 'string' ? segment[0] : '')
    .join('').trim();
  if (!result) throw new RetryableTranslationError('翻譯回應為空');
  return result;
}
