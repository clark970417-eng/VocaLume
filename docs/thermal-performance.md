# Local translation and heat

VocaLume 4.4.3 reduces **optional rolling recognition** when inference is slow or the OS reports thermal pressure. It keeps the selected recognition and translation models, language settings, and completed-sentence translation path.

## Scheduling

- A source draft starts promptly when no cooldown is active.
- After a slow primary decode, the next optional draft leaves idle time proportional to the work just completed. The former 2.5-second cadence ceiling no longer forces repeated work faster than the decoder can finish.
- macOS thermal state and available CPU speed reduce optional recognition further. Unsupported platforms still adapt to measured decode duration; they do not infer a temperature from timing.
- Under warm pressure, optional extra draft STT and preview speaker analysis stop. At critical pressure, rolling drafts pause; completed acoustic utterances continue through recognition and translation.
- Queued final translations have priority. The policy can omit a speculative source revision, but does not discard accepted final audio or its translation. Existing recording capacity/error handling still applies if even final processing cannot keep up.
- After pressure falls, the policy restores one level every 30 seconds to avoid repeatedly returning to full-rate work while cooling.

The work/idle targets apply to admission of optional recognition, **not total CPU/GPU utilization or a device power cap**. Final sentences bypass preview cooldowns. Browser desktop mode uses both the desktop admission check and the extension's measured round-trip duration. Browser-only mode uses timing without desktop thermal feedback.

## What changes while watching

During heat or sustained slow decoding, Japanese drafts update less often. At critical pressure they may appear only after a sentence ends. Complete Chinese translations keep their existing model and sentence order. The policy does not promise faster first drafts or shorter delays in every sample; its purpose is to remove repeated work that can worsen sustained heat and backlog.

The extension's diagnostics show the OS state, whether recovery is active, whether previews are paused, their current interval, and how many draft revisions were skipped for the budget.

## Limits

This cannot guarantee a cool computer or eliminate macOS throttling. Video playback, other programs, ambient temperature, and full-sentence inference also consume power. A fanless laptop can remain warm even after optional work is reduced. The policy does not bypass system thermal protections or automatically replace a user's selected model with a smaller, less accurate model.

See [the verification record](retests/4.4.3.md) for the measured scope. A short fixture is not a long livestream, and model processing time is not an energy or temperature measurement.
