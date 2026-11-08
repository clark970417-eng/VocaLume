/** Provider settings are shared by the popup and background worker. Never expose keys in status/errors. */
export const API_PROVIDERS = [
  {id: 'auto', label: '沿用目前方式（本機／自動）'},
  {id: 'openai', label: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1'},
  {id: 'gemini', label: 'Google Gemini', format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta'},
  {id: 'anthropic', label: 'Anthropic Claude', format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1'},
  {id: 'nvidia', label: 'NVIDIA', format: 'compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'nvidia/nemotron-3.5-lightning-30b-a3b', legacyKey: 'nvidiaKey'},
  {id: 'openrouter', label: 'OpenRouter', format: 'compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemma-4-31b-it:free', legacyKey: 'openrouterKey'},
  {id: 'custom', label: '自訂 API（OpenAI 相容）', format: 'compatible'},
];
export function selectedApi(saved = {}) {
  const id = saved.cloudTranslation?.provider || 'auto';
  if (!API_PROVIDERS.some(p => p.id === id)) throw new Error('請重新選擇 API 服務');
  return id;
}
export function apiProfile(saved, id = selectedApi(saved)) {
  const definition = API_PROVIDERS.find(p => p.id === id);
  if (!definition) throw new Error('不支援這個 API 服務');
  const profile = saved.cloudTranslation?.profiles?.[id] || {};
  return {...definition, model: profile.model ?? definition.model ?? '',
    baseUrl: definition.baseUrl || profile.baseUrl || '',
    apiKey: Object.hasOwn(profile, 'apiKey') ? profile.apiKey : (saved[definition.legacyKey] || '')};
}
export function apiEndpoint(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('請輸入有效的 API 網址'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('API 網址需使用 HTTPS；本機 localhost 可使用 HTTP');
  if (url.username || url.password || url.search || url.hash) throw new Error('API 網址不能包含帳密、查詢參數或 #');
  const base = url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return {baseUrl: base, origin: `${url.protocol}//${url.hostname}/*`, local};
}
export function validateApiProfile(profile, {allowMissingKey = false} = {}) {
  const model = String(profile.model || '').trim();
  if (!model || model.length > 200 || /\s|[\x00-\x1f]/.test(model)) throw new Error('請填入此服務可使用的模型名稱（模型 ID）');
  const endpoint = apiEndpoint(profile.baseUrl);
  const apiKey = String(profile.apiKey || '').trim();
  if (apiKey.length > 4096 || /[\x00-\x1f\x7f]/.test(apiKey)) throw new Error('API Key 格式不正確');
  if (!apiKey && !allowMissingKey && !(profile.id === 'custom' && endpoint.local)) throw new Error('請輸入此服務的 API Key');
  return {...profile, ...endpoint, model, apiKey};
}
export function apiSettingsUpdate(saved, form) {
  const provider = form.provider;
  if (!API_PROVIDERS.some(p => p.id === provider)) throw new Error('請選擇 API 服務');
  const previous = saved.cloudTranslation || {};
  const next = {provider, revision: (Number(previous.revision) || 0) + 1, profiles: {...previous.profiles}};
  if (provider === 'auto') return next;
  const old = apiProfile(saved, provider);
  const typed = String(form.apiKey || '').trim();
  const baseUrl = provider === 'custom' ? apiEndpoint(form.baseUrl).baseUrl : old.baseUrl;
  // Never forward an existing custom secret to a changed server/path without re-entry.
  if (provider === 'custom' && old.apiKey && old.baseUrl && apiEndpoint(old.baseUrl).baseUrl !== baseUrl && !typed && !form.clearKey) {
    throw new Error('API 網址已變更，請重新輸入金鑰，或勾選移除舊金鑰');
  }
  const profile = validateApiProfile({...old, baseUrl, model: form.model, apiKey: form.clearKey ? '' : typed || old.apiKey}, {allowMissingKey: Boolean(form.clearKey)});
  next.profiles[provider] = {model: profile.model, baseUrl: profile.baseUrl, apiKey: profile.apiKey};
  return next;
}
export function apiCacheScope(saved) {
  const profile = apiProfile(saved);
  const fallbacks = profile.id === 'auto' ? ['nvidia', 'openrouter'].map(id => {
    const candidate = apiProfile(saved, id);
    return [candidate.id, candidate.model, candidate.baseUrl, Boolean(candidate.apiKey)];
  }) : [];
  return JSON.stringify([profile.id, profile.model, profile.baseUrl, saved.cloudTranslation?.revision || 0, fallbacks]);
}
export function apiRequest(profile, messages) {
  const p = validateApiProfile(profile);
  const headers = {'Content-Type': 'application/json'};
  let url, body;
  if (p.format === 'gemini') {
    headers['x-goog-api-key'] = p.apiKey;
    url = `${p.baseUrl}/models/${encodeURIComponent(p.model.replace(/^models\//, ''))}:generateContent`;
    body = {systemInstruction: {parts: [{text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n')}]},
      contents: messages.filter(m => m.role !== 'system').map(m => ({role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}]})),
      generationConfig: {maxOutputTokens: 2048}};
  } else if (p.format === 'anthropic') {
    headers['x-api-key'] = p.apiKey;
    headers['anthropic-version'] = '2026-10-21';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    url = `${p.baseUrl}/messages`;
    body = {model: p.model, max_tokens: 2048, system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'), messages: messages.filter(m => m.role !== 'system')};
  } else {
    if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
    url = `${p.baseUrl}/chat/completions`;
    body = {model: p.model, messages, ...(p.format === 'openai' ? {max_completion_tokens: 2048, store: false} : {max_tokens: 2048})};
  }
  return {url, headers, body, origin: p.origin, format: p.format};
}
export function apiResponse(data, format) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RetryableTranslationError('API 回應格式不正確');
  }
  let text;
  if (format === 'gemini') {
    const candidate = data.candidates?.[0];
    if (!candidate && !data.promptFeedback?.blockReason) throw new RetryableTranslationError('API 沒有回傳翻譯文字');
    if (candidate?.finishReason !== 'STOP') throw new Error('API 未完成翻譯，請檢查模型或重試');
    text = candidate.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
  } else if (format === 'anthropic') {
    if (!['end_turn', 'stop_sequence'].includes(data.stop_reason)) throw new Error('API 未完成翻譯，請檢查模型或重試');
    text = data.content?.filter(p => p.type === 'text').map(p => p.text).join('');
  } else {
    const choice = data.choices?.[0];
    if (!choice) throw new RetryableTranslationError('API 沒有回傳翻譯文字');
    if (choice?.finish_reason !== 'stop') throw new Error('API 未完成翻譯，請檢查模型或重試');
    text = choice.message?.content;
  }
  if (typeof text !== 'string' || !text.trim()) throw new RetryableTranslationError('API 沒有回傳翻譯文字');
  return text.trim();
}

export class RetryableTranslationError extends Error {
  constructor(message, retryDelay = 200) {
    super(message);
    this.retryDelay = retryDelay;
  }
}

export function translationHttpError(response, message) {
  const status = response.status;
  if (![408, 425, 429].includes(status) && !(status >= 500 && status < 600)) return new Error(message);
  const after = response.headers?.get?.('Retry-After');
  const milliseconds = after ? (/^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : NaN;
  if (milliseconds > 1500) return new Error(message);
  return new RetryableTranslationError(message, Number.isFinite(milliseconds) ? Math.max(200, milliseconds) : status === 429 ? 400 : 200);
}

export async function retryTranslationRequest(run, signal) {
  signal.throwIfAborted();
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof RetryableTranslationError) || signal.aborted) throw error;
    await new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, error.retryDelay);
      signal.addEventListener('abort', finish, {once: true});
    });
    signal.throwIfAborted();
    return run();
  }
}

export async function requestApi(profile, messages, signal, {fetchImpl = globalThis.fetch, permissions = globalThis.chrome?.permissions, validate = value => value} = {}) {
  const request = apiRequest(profile, messages);
  if (permissions && !await permissions.contains({origins: [request.origin]})) throw new Error('請在 API 設定按儲存，允許連線到這個服務');
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  try {
    return await retryTranslationRequest(async () => {
      let response;
      try {
        response = await fetchImpl(request.url, {method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: deadline, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer'});
      } catch {
        // Fetch errors can include server URLs or credential-containing diagnostics.
        throw new RetryableTranslationError('無法連線到 API；請確認網址、連線權限與網路');
      }
      // Never follow a redirect, including the opaque response in browsers.
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        throw new Error('無法連線到 API；請確認 API 網址');
      }
      if (!response.ok) {
        const guidance = response.status === 401 || response.status === 403 ? '請檢查 API Key 和使用權限' : response.status === 429 ? '額度或速率限制，請稍後重試' : response.status === 400 || response.status === 404 ? '請檢查模型名稱與 API 網址' : '服務暫時無法使用';
        throw translationHttpError(response, `${profile.label} API ${response.status}：${guidance}`);
      }
      const data = await response.json().catch(() => { throw new RetryableTranslationError('API 回應格式不正確'); });
      const output = apiResponse(data, request.format);
      try {
        return validate(output);
      } catch (error) {
        throw new RetryableTranslationError(error.message);
      }
    }, deadline);
  } catch (error) {
    if (deadline.aborted) throw new Error(signal?.aborted ? 'API 翻譯已取消' : 'API 翻譯逾時，請稍後重試或選擇較快的模型');
    throw error;
  }
}
