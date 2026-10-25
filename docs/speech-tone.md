# Speech tone / 語氣與笑聲

In Opera GX, open VocaLume → **聽語音 → 語氣與笑聲**. Choose **自然標記（笑）**, **ww**, **笑** or **草**, then restart speech captions. **關閉** disables the feature. In the desktop app, use **Advanced Settings → Speech tone · 語氣與笑聲**; changes apply to subsequent captions. The default for a new installation is off.

The feature preserves terminal exclamation/question marks present in the recognized source and formats explicit laughter markers. It does not infer emotion from loudness. A recognition engine that omits an exclamation may still produce neutral punctuation.

On macOS 12 and newer, a bundled helper also checks captured audio with Apple's on-device [SoundAnalysis classifier](https://developer.apple.com/documentation/soundanalysis/snclassifysoundrequest). Recognized categories include laughter, giggling, snickering, chuckling and belly laughs. Only a classifier score of at least 0.93 produces a marker; this score is not a measured accuracy percentage. Brief or quiet laughter may be missed. The classifier cannot distinguish the speaker from a laugh track, another person or background audio.

Audio analysis runs once per finalized cue, alongside recognition. A late result is ignored after the caption is delivered. A busy helper is skipped; a stalled helper is stopped after 2.5 seconds and backs off for a minute. On thermal pressure, optional analysis is skipped so recognition and translation keep priority. The helper runs at reduced CPU priority, processes PCM in memory, and does not send audio over the network or save it to disk. Stopping captions terminates the helper.

Windows and Linux retain source punctuation and explicit transcript markers; they do not have the macOS acoustic classifier. Browser-only speech mode does not use this desktop feature. There is no automatic website translation toggle associated with the setting.

Markers are added after translation. They are excluded from translation caches, previous-sentence context and TTS input. Both single-pair captions and four-pair history receive the completed decorated result; their existing delivery order is preserved.

## Development and checks

Run `npm run build:voice-tone` inside `desktop-app` on macOS with Xcode Command Line Tools installed. macOS packaging builds the helper for each package architecture before signing. Other platforms do not need Swift. The helper accepts one JSON line per request with an integer `id` and base64 float32 mono PCM at 16 kHz, and returns the matching `id` and `confidence`.

For a public acoustic fixture, [Laughter(s) by sagetyrtle](https://commons.wikimedia.org/wiki/File:Laughter(s).ogg) is CC0; the 20–24-second and 36–40-second sections passed the conservative threshold on this Mac. Many softer sections stayed below it. The existing authored Japanese fixture and digital silence stayed below the threshold. [Laughter by ezwa](https://commons.wikimedia.org/wiki/File:Laughter.ogg) is public domain and also illustrates that audible laughter can stay below this conservative threshold. These checks do not establish recall across speakers, microphones or streams.
