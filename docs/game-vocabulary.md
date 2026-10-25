# Game vocabulary / 遊戲詞彙

VocaLume 4.5.0 includes 244 curated Japanese / Taiwan Traditional Chinese pairs, used in both directions. This expanded catalogue covers selected games, livestreams and common greetings.

The spoken Japanese title ヴァロラント is an additional alias of VALORANT / 特戰英豪. Common full greetings use exact-message shortcuts only; they are not inserted as glossary hints in longer sentences, which can cause small models to omit adjacent clauses.

Standalone unambiguous names have an exact whole-input fast path. Questions, negation, sentences and punctuation remain on the normal translation path. For sentences, only matching terms are offered, longest first, capped at eight. Explicit desktop context terminology wins over overlapping built-in hints. The browser's exact-name fast path uses this catalogue directly.

Ambiguous terms such as 色違い, ダウン, ファントム and レイス need the corresponding game context in the same input. A short comment without that context may use normal model translation instead. We do not infer a current game from a page title or remember one across unrelated comments. Katakana boundaries stop ダウン from matching ダウンロード. コダック needs Pokémon context because it also means [Kodak](https://www.kodak.com/ja/company/page/motion-picture/). Named Xに進化 / 進化成X compounds preserve the destination of an evolution.

These hints reach the local Llama-based translator (including speech captions and Chinese-to-Japanese drafts) and configured browser chat-model providers. Plain Google-style machine-translation endpoints do not accept custom sentence hints. Source recognition is unchanged: this does not train Whisper or add ASR hotwords.

Official naming references: [Taiwan Pokémon Pokédex](https://tw.portal-pokemon.com/play/pokedex/), [Japanese Pokémon names](https://www.pokemon.co.jp/ex/pika_vee/), [Terastal](https://www.pokemon.co.jp/ex/sv/ja/features/220803_07/), [VALORANT Chinese guide](https://playvalorant.com/zh-tw/news/announcements/beginners-guide/), [Japanese guide](https://playvalorant.com/ja-jp/news/announcements/beginners-guide/), [weapons](https://playvalorant.com/zh-tw/arsenal/), [Jett](https://playvalorant.com/zh-tw/agents/jett/), [Sova](https://playvalorant.com/zh-tw/agents/sova/), [Apex Chinese guide](https://help.ea.com/zh-hant/articles/apex-legends/how-to-play/), [PUBG](https://www.pubg.com/zh-tw/game-info/overview), [Counter-Strike 2](https://store.steampowered.com/app/730/CounterStrike_2/?l=tchinese). Generic shooter slang is an editorial translation choice, not an assertion that every publisher uses that wording.


New naming references: [Pokémon Scarlet/Violet Japanese](https://www.pokemon.co.jp/ex/sv/ja/pokemon/), [Traditional Chinese](https://www.pokemon.co.jp/ex/sv/tc/pokemon/), [VALORANT Japanese agents](https://playvalorant.com/ja-jp/agents/), [Traditional Chinese agents](https://playvalorant.com/zh-tw/agents/), [Minecraft Japanese terminology](https://www.minecraft.net/ja-jp/article/bedrock-nether-update-beta-jp), [Minecraft Traditional Chinese](https://www.minecraft.net/zh-hant/article/how-survive-your-first-night-minecraft). Generic game and livestream phrases are editorial equivalents.

Matching order and evolution compounds are built once at module load. Hints remain capped at eight, do not add a second model, and preserve personal glossary overrides. Everyday words such as 天井, 高評価 and 設置 require their domain context. Welcome phrases do not imply helping unless the source explicitly says so.

| Domain | Japanese / canonical title | Traditional Chinese | Exact-input fast path |
| --- | --- | --- | --- |
| title | VALORANT | 特戰英豪 | yes |
| title | Apex Legends | Apex 英雄 | yes |
| title | Counter-Strike 2 | 絕對武力 2 | yes |
| title | PUBG | 絕地求生 | yes |
| title | マインクラフト | Minecraft | yes |
| title | モンスターハンター | 魔物獵人 | yes |
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
| pokemon | ニャオハ | 新葉喵 | yes |
| pokemon | ホゲータ | 呆火鱷 | yes |
| pokemon | クワッス | 潤水鴨 | yes |
| pokemon | ニャローテ | 蒂蕾喵 | yes |
| pokemon | アチゲータ | 炙燙鱷 | yes |
| pokemon | ウェルカモ | 湧躍鴨 | yes |
| pokemon | マスカーニャ | 魔幻假面喵 | yes |
| pokemon | ラウドボーン | 骨紋巨聲鱷 | yes |
| pokemon | ウェーニバル | 狂歡浪舞鴨 | yes |
| pokemon | コライドン | 故勒頓 | yes |
| pokemon | ミライドン | 密勒頓 | yes |
| pokemon | ウネルミナモ | 波盪水 | yes |
| pokemon | テツノイサハ | 鐵斑葉 | yes |
| pokemon | サーフゴー | 賽富豪 | yes |
| pokemon | トドロクツキ | 轟鳴月 | yes |
| pokemon | サケブシッポ | 吼叫尾 | yes |
| pokemon | イダイナキバ | 雄偉牙 | yes |
| pokemon | テツノブジン | 鐵武者 | yes |
| pokemon | テツノツツミ | 鐵包袱 | yes |
| pokemon | テツノワダチ | 鐵轍跡 | yes |
| pokemon | コレクレー | 索財靈 | yes |
| pokemon | ボチ | 墓仔狗 | yes |
| pokemon | ハラバリー | 電肚蛙 | yes |
| pokemon | リキキリン | 奇麒麟 | yes |
| pokemon | ウミディグダ | 海地鼠 | yes |
| pokemon | グレンアルマ | 紅蓮鎧騎 | yes |
| pokemon | ソウブレイズ | 蒼炎刃鬼 | yes |
| pokemon | ガケガニ | 毛崖蟹 | yes |
| pokemon | タギングル | 塗標客 | yes |
| pokemon | モトトカゲ | 摩托蜥 | yes |
| pokemon | パピモッチ | 狗仔包 | yes |
| pokemon | ハルクジラ | 浩大鯨 | yes |
| pokemon | パモ | 布撥 | yes |
| pokemon | グルトン | 愛吃豚 | yes |
| pokemon | ミニーブ | 迷你芙 | yes |
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
| pokemon | 急所 | 要害 | context required |
| pokemon | すばやさ | 速度 | context required |
| pokemon | こうげき | 攻擊 | context required |
| pokemon | ぼうぎょ | 防禦 | context required |
| pokemon | とくこう | 特攻 | context required |
| pokemon | とくぼう | 特防 | context required |
| pokemon | タイプ一致 | 屬性一致 | context required |
| pokemon | 相性補完 | 屬性互補 | context required |
| pokemon | 夢特性 | 隱藏特性 | context required |
| pokemon | 孵化厳選 | 孵蛋刷個體 | context required |
| pokemon | 旅パ | 通關隊伍 | context required |
| pokemon | 対戦環境 | 對戰環境 | context required |
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
| shooter | プリエイム | 預瞄 | context required |
| shooter | ピーク | 探頭 | context required |
| shooter | プリファイア | 預開槍 | context required |
| shooter | ワンタップ | 一槍爆頭 | context required |
| shooter | フリック | 甩槍 | context required |
| shooter | トラッキング | 跟槍 | context required |
| shooter | クロスヘア | 準星 | context required |
| shooter | 感度 | 靈敏度 | context required |
| shooter | フラッシュ | 閃光彈 | context required |
| shooter | スモーク | 煙霧彈 | context required |
| shooter | グレネード | 手榴彈 | context required |
| shooter | カバー | 掩護 | context required |
| shooter | フランク | 繞後 | context required |
| shooter | 裏取り | 包抄 | context required |
| shooter | 高所 | 高點 | context required |
| shooter | 索敵 | 偵查敵人 | context required |
| shooter | 足音 | 腳步聲 | context required |
| shooter | ピンを刺す | 標記位置 | context required |
| shooter | 確殺 | 補掉倒地敵人 | context required |
| shooter | 蘇生 | 救起隊友 | context required |
| shooter | フルパ | 滿編隊伍 | context required |
| shooter | 野良 | 路人隊友 | context required |
| shooter | 回復 | 補血 | context required |
| shooter | 残弾 | 剩餘子彈 | context required |
| shooter | 撃ち合い | 對槍 | context required |
| valorant | スパイク | 輻能核心 | context required |
| valorant | ヴァンダル | 暴徒 | context required |
| valorant | ファントム | 幻象 | context required |
| valorant | オペレーター | 間諜 | context required |
| valorant | エージェント | 特務 | context required |
| valorant | ジェット | 婕提 | context required |
| valorant | ソーヴァ | 蘇法 | context required |
| valorant | セージ | 聖祈 | context required |
| valorant | レイナ | 蕾娜 | context required |
| valorant | オーメン | 歐門 | context required |
| valorant | キルジョイ | 愷宙 | context required |
| valorant | サイファー | 瑟符 | context required |
| valorant | レイズ | 芮茲 | context required |
| valorant | ヴァイパー | 薇蝮 | context required |
| valorant | フェニックス | 菲尼克斯 | context required |
| valorant | ブリムストーン | 布史東 | context required |
| valorant | ヨル | 夜戮 | context required |
| valorant | スカイ | 絲凱 | context required |
| valorant | チェンバー | 錢博爾 | context required |
| valorant | ネオン | 妮虹 | context required |
| valorant | フェイド | 菲德 | context required |
| valorant | ゲッコー | 蓋克 | context required |
| valorant | アストラ | 亞星卓 | context required |
| valorant | エコラウンド | 經濟局 | context required |
| valorant | フルバイ | 全裝購買 | context required |
| valorant | リテイク | 回防奪點 | context required |
| valorant | 設置 | 安裝輻能核心 | context required |
| valorant | 解除 | 拆除輻能核心 | context required |
| apex | シールドバッテリー | 護盾電池 | context required |
| apex | シールドセル | 小型護盾電池 | context required |
| apex | ノックダウンシールド | 擊倒護盾 | context required |
| apex | パスファインダー | 探路者 | context required |
| apex | ブラッドハウンド | 尋血犬 | context required |
| apex | レイス | 惡靈 | context required |
| minecraft | クリーパー | 苦力怕 | context required |
| minecraft | エンダードラゴン | 終界龍 | context required |
| minecraft | エンダーマン | 終界使者 | context required |
| minecraft | ネザー | 地獄 | context required |
| minecraft | レッドストーン | 紅石 | context required |
| minecraft | 作業台 | 工作台 | context required |
| minecraft | かまど | 熔爐 | context required |
| minecraft | エンチャント | 附魔 | context required |
| minecraft | スポナー | 生怪磚 | context required |
| minecraft | 村人 | 村民 | context required |
| minecraft | ダイヤモンド | 鑽石 | context required |
| minecraft | ツルハシ | 鎬 | context required |
| minecraft | 丸石 | 鵝卵石 | context required |
| minecraft | ネザライト | 獄髓 | context required |
| minecraft | エリトラ | 鞘翅 | context required |
| game | クエスト | 任務 | context required |
| game | メインクエスト | 主線任務 | context required |
| game | サブクエスト | 支線任務 | context required |
| game | ボス戦 | 頭目戰 | context required |
| game | ラスボス | 最終頭目 | context required |
| game | 周回 | 重複刷關 | context required |
| game | 初見プレイ | 首次遊玩 | context required |
| game | 縛りプレイ | 限制條件挑戰 | context required |
| game | ノーダメージ | 無傷 | context required |
| game | セーブポイント | 存檔點 | context required |
| game | チェックポイント | 檢查點 | context required |
| game | 装備更新 | 更換裝備 | context required |
| game | スキルツリー | 技能樹 | context required |
| game | バフ | 增益效果 | context required |
| game | デバフ | 減益效果 | context required |
| game | 状態異常 | 異常狀態 | context required |
| game | ドロップ率 | 掉落率 | context required |
| game | リセマラ | 刷首抽 | context required |
| game | 天井 | 保底 | context required |
| game | ガチャ | 抽卡 | context required |
| game | 無課金 | 不課金 | context required |
| game | 課金 | 課金 | context required |
| stream | 初見です | 第一次來看直播 | context required |
| stream | ROM専 | 潛水觀眾 | context required |
| stream | コメント欄 | 留言區 | context required |
| stream | チャット欄 | 聊天室 | context required |
| stream | 同時視聴 | 同步觀看 | context required |
| stream | 参加型 | 觀眾參加型 | context required |
| stream | 歌枠 | 歌回 | context required |
| stream | 耐久配信 | 耐久直播 | context required |
| stream | 雑談配信 | 雜談直播 | context required |
| stream | 朝活 | 早晨直播 | context required |
| stream | 配信枠 | 直播場次 | context required |
| stream | 待機所 | 直播等待室 | context required |
| stream | 配信アーカイブ | 直播存檔 | context required |
| stream | 切り抜き動画 | 精華剪輯影片 | context required |
| stream | メンバー限定 | 會員限定 | context required |
| stream | スーパーチャット | 超級留言 | context required |
| stream | メンバーシップ | 頻道會員 | context required |
| stream | チャンネル登録 | 訂閱頻道 | context required |
| stream | 高評価 | 按讚 | context required |
| stream | 音量バランス | 音量平衡 | context required |
| stream | 音ズレ | 影音不同步 | context required |
| stream | マイクミュート | 麥克風靜音 | context required |
| stream | 回線落ち | 網路斷線 | context required |
| stream | 配信遅延 | 直播延遲 | context required |
| stream | ネタバレ禁止 | 禁止劇透 | context required |
| stream | 指示コメント | 指揮型留言 | context required |
| stream | 推し活 | 應援活動 | context required |
| stream | 推し変 | 換推 | context required |
| stream | 箱推し | 全團推 | context required |
| stream | 最推し | 最喜歡的推 | context required |
| phrase | 来てくれてありがとうございます | 謝謝您的到來 | yes |
| phrase | 来てくれてありがとう | 謝謝你來 | yes |
| phrase | 無理しないでね | 別勉強自己喔 | yes |
| phrase | お大事にしてください | 請好好保重身體 | yes |
