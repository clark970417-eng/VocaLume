# Pokémon card shorthand correction — 2026-10-30

The recorded Japanese caption lost the final mora of ポケカ (Pokémon cards), producing ポケが. The translator then treated the unknown word as a name. The shared vocabulary also lacked the card-game abbreviation.

Changes:
- Add canonical ポケモンカード → 寶可夢卡, with ポケカ as a Japanese alias. Chinese replies use the full Japanese name.
- Offer the two card terms to subsequent recognition decodes when the current hypothesis contains the bounded abbreviation or clipped ポケ. Keep personal vocabulary priority and existing size limits.
- Do not replace arbitrary ポケ, ボケ, ポケット, ポケベル or generic カード in source text. No added capture waiting or extra recognition pass.
- Keep laughter-setting copy platform-neutral in both interface languages.

Verification:
- 856 desktop unit tests and all 295 extension unit tests passed.
- Production build and installed-package source/signature verification passed. App replaced with the verified bundle; Opera GX extension explicitly reported Reloaded. App reopened to its ready state.
- Compared the same 13-second captured audio with the existing local Whisper engine. No hint: ポケが好き, 512 ms. Hint ポケカ、ポケモンカード: ポケカ好き, 500 ms. These single warm observations are not a general speed benchmark.
- A broader three-term hint including ポケモン did not resolve the error and was rejected.
- Actual local translation of the corrected sentence returned 爺爺也知道我喜歡寶可夢卡呢。 (342 ms). The following message also retained 寶可夢卡 (242 ms).

Limits: hints affect subsequent decodes rather than forcing transcript replacement. An isolated first-pass clipped word may still be ambiguous. This focused regression does not establish general ASR accuracy or fix unrelated dropped subjects. Raw creator audio remains outside version control; no new public video was published.

Source used for the private recording: https://www.youtube.com/watch?v=KISmMEKMBjk (24:32–25:00).
