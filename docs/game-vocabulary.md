# Game vocabulary / 遊戲詞彙

VocaLume 4.4.4 adds 78 curated Japanese / Taiwan Traditional Chinese pairs, used in both directions. This is a first catalogue, not a complete Pokémon roster or a dictionary of every game.

Standalone unambiguous names have an exact whole-input fast path. Questions, negation, sentences and punctuation remain on the normal translation path. For sentences, only matching terms are offered, longest first, capped at eight. Explicit desktop context terminology wins over overlapping built-in hints. The browser's exact-name fast path uses this catalogue directly.

Ambiguous terms such as 色違い, ダウン, ファントム and レイス need the corresponding game context in the same input. A short comment without that context may use normal model translation instead. We do not infer a current game from a page title or remember one across unrelated comments. Katakana boundaries stop ダウン from matching ダウンロード. コダック needs Pokémon context because it also means [Kodak](https://www.kodak.com/ja/company/page/motion-picture/). Named Xに進化 / 進化成X compounds preserve the destination of an evolution.

These hints reach the local Llama-based translator (including speech captions and Chinese-to-Japanese drafts) and configured browser chat-model providers. Plain Google-style machine-translation endpoints do not accept custom sentence hints. Source recognition is unchanged: this does not train Whisper or add ASR hotwords.

Official naming references: [Taiwan Pokémon Pokédex](https://tw.portal-pokemon.com/play/pokedex/), [Japanese Pokémon names](https://www.pokemon.co.jp/ex/pika_vee/), [Terastal](https://www.pokemon.co.jp/ex/sv/ja/features/220803_07/), [VALORANT Chinese guide](https://playvalorant.com/zh-tw/news/announcements/beginners-guide/), [Japanese guide](https://playvalorant.com/ja-jp/news/announcements/beginners-guide/), [weapons](https://playvalorant.com/zh-tw/arsenal/), [Jett](https://playvalorant.com/zh-tw/agents/jett/), [Sova](https://playvalorant.com/zh-tw/agents/sova/), [Apex Chinese guide](https://help.ea.com/zh-hant/articles/apex-legends/how-to-play/), [PUBG](https://www.pubg.com/zh-tw/game-info/overview), [Counter-Strike 2](https://store.steampowered.com/app/730/CounterStrike_2/?l=tchinese). Generic shooter slang is an editorial translation choice, not an assertion that every publisher uses that wording.

| Domain | Japanese / canonical title | Traditional Chinese | Exact-name fast path |
| --- | --- | --- | --- |
| title | VALORANT | 特戰英豪 | yes |
| title | Apex Legends | Apex 英雄 | yes |
| title | Counter-Strike 2 | 絕對武力 2 | yes |
| title | PUBG | 絕地求生 | yes |
| pokemon | ポケモン | 寶可夢 | yes |
| pokemon | ピカチュウ | 皮卡丘 | yes |
| pokemon | イーブイ | 伊布 | yes |
| pokemon | リザードン | 噴火龍 | yes |
| pokemon | フシギダネ | 妙蛙種子 | yes |
| pokemon | ゼニガメ | 傑尼龜 | yes |
| pokemon | カビゴン | 卡比獸 | yes |
| pokemon | ゲンガー | 耿鬼 | yes |
| pokemon | ミュウツー | 超夢 | yes |
| pokemon | ルカリオ | 路卡利歐 | yes |
| pokemon | ゲッコウガ | 甲賀忍蛙 | yes |
| pokemon | サーナイト | 沙奈朵 | yes |
| pokemon | ガブリアス | 烈咬陸鯊 | yes |
| pokemon | ニンフィア | 仙子伊布 | yes |
| pokemon | ミミッキュ | 謎擬Q | yes |
| pokemon | シャワーズ | 水伊布 | yes |
| pokemon | エーフィ | 太陽伊布 | yes |
| pokemon | ブラッキー | 月亮伊布 | yes |
| pokemon | リーフィア | 葉伊布 | yes |
| pokemon | グレイシア | 冰伊布 | yes |
| pokemon | コイキング | 鯉魚王 | yes |
| pokemon | ギャラドス | 暴鯉龍 | yes |
| pokemon | モンスターボール | 精靈球 | yes |
| pokemon | マスターボール | 大師球 | yes |
| pokemon | ポケモンセンター | 寶可夢中心 | yes |
| pokemon | テラスタル | 太晶化 | yes |
| pokemon | テラレイドバトル | 太晶團體戰 | yes |
| pokemon | きあいのタスキ | 氣勢披帶 | yes |
| pokemon | コダック | 可達鴨 | context required |
| pokemon | サンダース | 雷伊布 | context required |
| pokemon | ブースター | 火伊布 | context required |
| pokemon | 色違い | 異色 | context required |
| pokemon | 個体値 | 個體值 | context required |
| pokemon | 努力値 | 努力值 | context required |
| pokemon | 種族値 | 種族值 | context required |
| pokemon | 特性 | 特性 | context required |
| pokemon | タイプ相性 | 屬性相剋 | context required |
| pokemon | 色違い厳選 | 刷異色 | context required |
| pokemon | 個体値厳選 | 刷個體 | context required |
| pokemon | でんこうせっか | 電光一閃 | context required |
| pokemon | 10まんボルト | 十萬伏特 | context required |
| pokemon | かえんほうしゃ | 噴射火焰 | context required |
| shooter | ヘッドショット | 爆頭 | context required |
| shooter | リロード | 換彈 | context required |
| shooter | リコイル | 後座力 | context required |
| shooter | リコイル制御 | 壓槍 | context required |
| shooter | 腰撃ち | 腰射 | context required |
| shooter | エイム | 瞄準 | context required |
| shooter | キャラコン | 身法 | context required |
| shooter | ノックダウン | 擊倒 | context required |
| shooter | ダウン | 倒地 | context required |
| shooter | アーマー | 護甲 | context required |
| shooter | アーマー割り | 破甲 | context required |
| shooter | 漁夫 | 勸架 | context required |
| shooter | 射線 | 槍線 | context required |
| shooter | 遮蔽物 | 掩體 | context required |
| shooter | 弾薬 | 彈藥 | context required |
| shooter | 弾切れ | 沒子彈 | context required |
| shooter | ランクマッチ | 積分賽 | context required |
| shooter | リスポーン | 重生 | context required |
| shooter | クールダウン | 冷卻時間 | context required |
| valorant | スパイク | 輻能核心 | context required |
| valorant | ヴァンダル | 暴徒 | context required |
| valorant | ファントム | 幻象 | context required |
| valorant | オペレーター | 間諜 | context required |
| valorant | エージェント | 特務 | context required |
| valorant | ジェット | 婕提 | context required |
| valorant | ソーヴァ | 蘇法 | context required |
| apex | シールドバッテリー | 護盾電池 | context required |
| apex | シールドセル | 小型護盾電池 | context required |
| apex | ノックダウンシールド | 擊倒護盾 | context required |
| apex | パスファインダー | 探路者 | context required |
| apex | ブラッドハウンド | 尋血犬 | context required |
| apex | レイス | 惡靈 | context required |
