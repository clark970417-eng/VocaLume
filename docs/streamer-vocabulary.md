# Creator greetings

VocaLume recognizes a small, explicit catalogue of creator greetings when reading Japanese into Traditional Chinese. It does not construct `kon + any name` or `otsu + any name`, and Chinese-to-Japanese writing keeps ordinary Japanese greetings unless the user writes a catchphrase explicitly.

| Creator | Greeting | Meaning |
| --- | --- | --- |
| 鹿乃まほろ | こんまほ / konmaho | 你好 |
| 鹿乃まほろ | おつかの / otsukano | 辛苦了 |
| 兎田ぺこら | こんぺこ / konpeko | 你好 |
| 兎田ぺこら | おつぺこ / otsupeko | 辛苦了 |
| 兎田ぺこら | おはぺこ / ohapeko | 早安 |
| 兎田ぺこら | おやすみぺこ / oyasumipeko | 晚安 |
| 博衣こより | こんこよ / konkoyo | 你好 |
| 博衣こより | おつこよ / otsukoyo | 辛苦了 |

`こん…` can blend こんにちは or こんばんは. Without time-of-day context, the translation uses neutral 你好 rather than assuming it is evening. `おつ…` comes from お疲れさま and often closes a stream or thanks the creator.

## Behavior

- Recognize case, full-width text, katakana, kana elongation and supplied emoji in standalone greetings.
- Translate those standalone messages directly, avoiding a model request. Longer input only normalizes an opening greeting to standard Japanese before translation; the displayed source, names, punctuation, negation and remaining text are preserved.
- Leave unknown combinations, ordinary Japanese words, quoted expressions, questions, hashtags and account handles to the translator.
- Japanese-reading detection also recognizes standalone romanized entries in enabled website adapters; normal English stays outside that Japanese-only rule.
- Matching personal glossary entries take precedence in the desktop local translator.
- This improves recognized text translation. It does not train or retune the speech recognizer, and cannot recover a catchphrase the recognizer failed to transcribe.

The catalogue is shared by the extension and desktop in [`streamer-vocabulary.js`](../streamer-vocabulary.js), with an ES module facade. Public preview packaging includes both files.

## Sources

- 鹿乃まほろ's two spellings and meanings were supplied by the user on 2026-10-18; they have not been independently verified against a creator-authored page.
- 兎田ぺこら: the official [birthday voice listing](https://hololive.booth.pm/items/1770801) explicitly lists the four greeting forms above.
- 博衣こより: her official [Talk & Singing stream description](https://www.youtube.com/watch?v=TJEkQ_O2DxA) uses both こんこよ and おつこよ (search-indexed description; the video page could not be fetched directly during this check).
