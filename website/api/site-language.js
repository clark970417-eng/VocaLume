import { languageForCountry } from '../lib/site-language.mjs';

// Use the hosting platform's country header; do not return or store the IP.
export default function handler(request, response) {
  const language = languageForCountry(request.headers['x-vercel-ip-country']);
  // The App and browser extension also use this public, language-only endpoint.
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Vary', 'X-Vercel-IP-Country');
  response.status(200).json({ language });
}
