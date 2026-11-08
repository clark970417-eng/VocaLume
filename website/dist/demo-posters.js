const streamSource = [
  'それ恥ずかしいと思うんだけどそういうの買う人じゃないから',
  'コンビニに行った時たまに'
];
const chatSource = 'こんばんは！今日は何のゲームをする？';
const replySource = 'こんばんは！今日はポケモンで遊ぼう！';

const traditionalChinese = {
  stream: ['我覺得有點不好意思，因為我平常不太會買這種東西。', '偶爾去便利商店的時候……'],
  messages: ['送禮物真好呢。', '真是個很棒的爺爺。', '我會一直支持你！', '今天也很開心！', '我懂那種感覺，哈哈。', '會想好好珍惜呢。', '聽得心裡暖暖的！'],
  incoming: '晚上好！今天要玩什麼遊戲？',
  reply: '晚上好！今天一起玩寶可夢吧！',
  label: '中',
  replyPair: '中 → 日'
};

const locales = {
  'zh-Hant': {
    play: '播放示範',
    targetLang: 'zh-Hant',
    youtube: {
      title: '【閒聊】這週也辛苦啦！',
      search: '搜尋', create: '建立', chat: '重點聊天室訊息',
      audience: '9,999 人正在觀看　開始直播時間為 1 小時前',
      subscribers: '53.7 萬位訂閱者', perks: '查看福利', notify: '通知',
      likes: '讚 1,194', dislike: '倒讚', share: '分享',
      type: '聊天…', reply: '中／日', simulated: '模擬聊天室 · 非真實觀眾留言'
    },
    discord: {
      tagline: '跨語聊天，一樣自然。', simulated: '模擬對話 · 非真實訊息',
      server: '日文聊天好友', channel: '聊天', games: '遊戲', offTopic: '閒聊',
      topic: '用日文和中文輕鬆聊天', textChannels: '文字頻道', voiceChannels: '語音頻道',
      gameCall: '遊戲通話', online: '線上', today: '今天',
      step: '翻成日文，確認後再送出', workflow: '功能流程模擬'
    },
    translation: traditionalChinese
  },
  'zh-Hans': {
    play: '播放演示',
    targetLang: 'zh-Hans',
    youtube: {
      title: '【闲聊】这周也辛苦啦！',
      search: '搜索', create: '创建', chat: '热门聊天消息',
      audience: '9,999 人正在观看　1 小时前开始直播',
      subscribers: '53.7 万位订阅者', perks: '查看福利', notify: '通知',
      likes: '赞 1,194', dislike: '不喜欢', share: '分享',
      type: '聊天…', reply: '中／日', simulated: '模拟聊天室 · 非真实观众留言'
    },
    discord: {
      tagline: '跨语言聊天，一样自然。', simulated: '模拟对话 · 非真实消息',
      server: '日语聊天好友', channel: '聊天', games: '游戏', offTopic: '闲聊',
      topic: '用日语和中文轻松聊天', textChannels: '文字频道', voiceChannels: '语音频道',
      gameCall: '游戏通话', online: '在线', today: '今天',
      step: '翻成日语，确认后再发送', workflow: '功能流程演示'
    },
    translation: {
      stream: ['我觉得有点不好意思，因为我平时不太会买这种东西。', '偶尔去便利店的时候……'],
      messages: ['送礼物真好啊。', '真是个很棒的爷爷。', '我会一直支持你！', '今天也很开心！', '我懂那种感觉，哈哈。', '会想好好珍惜呢。', '听得心里暖暖的！'],
      incoming: '晚上好！今天要玩什么游戏？',
      reply: '晚上好！今天一起玩宝可梦吧！',
      label: '中',
      replyPair: '中 → 日'
    }
  },
  en: {
    play: 'Play the demo',
    targetLang: 'en',
    youtube: {
      title: 'Just chatting · Thanks for this week!',
      search: 'Search', create: 'Create', chat: 'Top chat',
      audience: '9,999 watching now · Started streaming 1 hour ago',
      subscribers: '537K subscribers', perks: 'View perks', notify: 'Notify me',
      likes: 'Like 1,194', dislike: 'Dislike', share: 'Share',
      type: 'Chat…', reply: 'EN／JA', simulated: 'Simulated chat · Fictional comments'
    },
    discord: {
      tagline: 'Chat naturally across languages.', simulated: 'Simulated conversation · Fictional messages',
      server: 'Japanese Friends', channel: 'chat', games: 'games', offTopic: 'off-topic',
      topic: 'Chat in Japanese and English', textChannels: 'Text channels', voiceChannels: 'Voice channels',
      gameCall: 'Game chat', online: 'Online', today: 'Today',
      step: 'Translate to Japanese and review before sending', workflow: 'Simulated workflow'
    },
    translation: {
      stream: ['I’d feel a little embarrassed, since I don’t usually buy that kind of thing.', 'Sometimes when I go to the convenience store…'],
      messages: ['Gifts are great, aren’t they?', 'What a wonderful grandpa.', 'I’m always cheering you on!', 'I’m having fun again today!', 'I know the feeling, lol.', 'You’d want to treasure it, huh?', 'That warmed my heart!'],
      incoming: 'Good evening! What are we playing today?',
      reply: 'Good evening! Let’s play Pokémon today!',
      label: 'EN',
      replyPair: 'EN → JA'
    }
  },
  ja: {
    play: 'デモを再生',
    targetLang: 'zh-Hant',
    youtube: {
      title: '【雑談】今週もおつかれさま〜！',
      search: '検索', create: '作成', chat: '上位のチャット',
      audience: '9,999 人が視聴中　1 時間前に配信開始',
      subscribers: 'チャンネル登録者数 53.7 万人', perks: '特典を見る', notify: '通知',
      likes: '高評価 1,194', dislike: '低評価', share: '共有',
      type: 'チャット…', reply: '中／日', simulated: 'チャットの再現 · 架空のコメント'
    },
    discord: {
      tagline: '言葉の違いを越えて、自然な会話を。', simulated: '会話の再現 · 架空のメッセージ',
      server: '日本語フレンズ', channel: 'おしゃべり', games: 'ゲーム', offTopic: '雑談',
      topic: '日本語と中国語で気軽に話そう', textChannels: 'テキストチャンネル', voiceChannels: 'ボイスチャンネル',
      gameCall: 'ゲーム通話', online: 'オンライン', today: '今日',
      step: '日本語に翻訳し、内容を確認してから送信', workflow: '操作手順の再現'
    },
    translation: traditionalChinese
  },
  ko: {
    play: '데모 재생',
    targetLang: 'ko',
    youtube: {
      title: '잡담 · 이번 주도 수고했어요!',
      search: '검색', create: '만들기', chat: '주요 채팅',
      audience: '9,999명 시청 중 · 1시간 전에 스트리밍 시작',
      subscribers: '구독자 53.7만 명', perks: '혜택 보기', notify: '알림',
      likes: '좋아요 1,194', dislike: '싫어요', share: '공유',
      type: '채팅…', reply: '한／일', simulated: '채팅 재현 · 가상의 댓글'
    },
    discord: {
      tagline: '다른 언어로도 자연스럽게 대화하세요.', simulated: '재현한 대화 · 가상의 메시지',
      server: '일본어 친구들', channel: '채팅', games: '게임', offTopic: '잡담',
      topic: '일본어와 한국어로 편하게 대화하세요', textChannels: '텍스트 채널', voiceChannels: '음성 채널',
      gameCall: '게임 통화', online: '온라인', today: '오늘',
      step: '일본어로 번역하고 확인한 뒤 보내세요', workflow: '기능 사용 예시'
    },
    translation: {
      stream: ['좀 부끄럽긴 한데, 저는 평소에 그런 걸 사는 편이 아니거든요.', '가끔 편의점에 갔을 때…'],
      messages: ['선물은 참 좋지.', '정말 멋진 할아버지네.', '항상 응원하고 있어!', '오늘도 즐거워!', '그 기분 알아 ㅋㅋ', '소중히 간직하고 싶겠네.', '마음이 따뜻해졌어!'],
      incoming: '안녕! 오늘은 무슨 게임 할 거야?',
      reply: '안녕! 오늘은 포켓몬 같이 하자!',
      label: '한',
      replyPair: '한 → 일'
    }
  }
};

const streamMessages = [
  ['Riku', '#9a5075', 'プレゼントっていいよね'],
  ['Nana', '#a08c6d', '素敵なおじいちゃんだね'],
  ['Tomo', '#806bc1', 'いつも応援してる！'],
  ['Haru', '#087a8c', '今日も楽しい！'],
  ['Mina', '#2585b6', 'その気持ちわかるw'],
  ['Ken', '#9a5075', '大事にしたいね'],
  ['Nao', '#a08c6d', 'ほっこりした！']
];

function escape(text) {
  return text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

function rect(x, y, width, height, fill, rx = 0) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}"/>`;
}

function text(x, y, value, {
  size = 24, fill = '#f2f2f2', anchor = 'start', weight = 400, lang = ''
} = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${lang ? ` lang="${lang}"` : ''}>${escape(value)}</text>`;
}

function pill(x, y, width, value, options = {}) {
  const height = options.height ?? 46;
  return rect(x, y, width, height, options.background ?? '#292929', height / 2)
    + text(x + width / 2, y + height / 2 + 7, value, { ...options, anchor: 'middle' });
}

function streamOverlay({ youtube, translation, targetLang }) {
  const dark = '#050505';
  const chatBackground = '#0f0f0f';
  const subtle = '#aaa';
  const japanese = { fill: '#fff0a3', size: 22, lang: 'ja', weight: 650 };
  const translated = { fill: '#bbffda', size: 20, lang: targetLang, weight: 650 };
  return `
    ${rect(100, 8, 462, 43, '#303437', 15)}
    <path d="M122 16v17l12-8.5z" fill="#f2f2f2"/>
    ${text(160, 33, youtube.title, { size: 19 })}
    ${rect(289, 124, 38, 40, dark)}
    <rect x="531" y="123" width="620" height="56" rx="28" fill="${dark}" stroke="#343434" stroke-width="2"/>
    ${text(556, 159, youtube.search, { size: 22, fill: subtle })}
    <circle cx="1110" cy="147" r="10" fill="none" stroke="#ddd" stroke-width="2"/>
    <path d="m1118 155 11 11" stroke="#ddd" stroke-width="2"/>
    ${rect(1610, 129, 162, 46, dark)}
    ${text(1640, 161, `+  ${youtube.create}`, { size: 19 })}
    ${rect(55, 930, 1279, 61, dark)}
    ${rect(108, 991, 1226, 89, dark)}
    ${text(69, 967, youtube.title, { size: 25, weight: 650 })}
    ${text(1330, 974, youtube.audience, { anchor: 'end', size: 20, fill: subtle })}
    ${text(119, 1020, '鹿乃まほろ / Kano Mahoro', { size: 22, lang: 'ja' })}
    ${text(119, 1051, youtube.subscribers, { size: 17, fill: subtle })}
    ${pill(480, 1004, 137, youtube.perks, { size: 18, background: '#f1f1f1', fill: dark })}
    ${pill(628, 1004, 126, youtube.notify, { size: 18 })}
    ${pill(819, 1004, 241, `${youtube.likes}   │   ${youtube.dislike}`, { size: 18 })}
    ${pill(1072, 1004, 145, `${youtube.share} ↗`, { size: 18 })}
    ${pill(1230, 1004, 104, '⋯', { size: 23 })}
    ${rect(1372, 203, 496, 851, chatBackground, 16)}
    <rect x="1372" y="203" width="496" height="851" rx="16" fill="none" stroke="#333" stroke-width="2"/>
    <path d="M1373 277h494M1373 982h494" stroke="#333" stroke-width="2"/>
    ${text(1394, 246, `${youtube.chat}  ⌄`, { size: 23 })}
    ${text(1836, 246, '×', { size: 22, anchor: 'middle' })}
    ${streamMessages.map(([name, color, original], index) => {
      const y = 311 + index * 92;
      return `
        <circle cx="1410" cy="${y + 10}" r="17" fill="${color}"/>
        ${text(1410, y + 16, name[0], { size: 16, anchor: 'middle' })}
        ${text(1440, y, `@${name}`, { size: 17, fill: subtle })}
        ${text(1440, y + 27, original, { size: 21, lang: 'ja' })}
        ${text(1440, y + 58, `${translation.label} · ${translation.messages[index]}`, { size: 20, fill: '#68d9af', lang: targetLang })}
      `;
    }).join('')}
    ${text(1395, 968, youtube.simulated, { size: 14, fill: '#aaa' })}
    ${rect(1388, 997, 286, 48, '#292929', 24)}
    ${text(1407, 1028, youtube.type, { size: 21, fill: subtle })}
    ${pill(1584, 1005, 76, youtube.reply, { size: 17, height: 33, background: '#fff', fill: dark })}
    ${pill(1689, 997, 48, '♧', { size: 27 })}
    ${pill(1748, 997, 48, '$', { size: 24 })}
    ${pill(1807, 997, 48, '♡', { size: 27 })}
    ${rect(592, 771, 670, 142, '#8c423e')}
    ${text(604, 798, streamSource[0], japanese)}
    ${text(604, 830, translation.stream[0], translated)}
    ${text(604, 868, streamSource[1], japanese)}
    ${text(604, 898, translation.stream[1], translated)}
  `;
}

function discordOverlay({ discord, translation, targetLang }) {
  const subtle = '#b6b7be';
  return `
    ${rect(0, 0, 1920, 1080, '#1f2022')}
    ${text(104, 87, 'VocaLume', { size: 41, weight: 600 })}
    ${text(399, 85, discord.tagline, { size: 24, fill: subtle })}
    ${pill(1340, 43, 475, discord.simulated, { size: 21, height: 52, background: '#292a2e', fill: subtle })}
    ${rect(100, 132, 1721, 808, '#313338', 27)}
    ${rect(100, 132, 329, 808, '#2b2d31', 25)}
    ${rect(100, 132, 88, 808, '#202225', 25)}
    <circle cx="145" cy="194" r="25" fill="#5865f2"/>
    ${text(145, 203, 'V', { size: 26, anchor: 'middle' })}
    <circle cx="145" cy="284" r="22" fill="#36383c"/>
    <circle cx="145" cy="358" r="22" fill="#36383c"/>
    ${text(210, 184, discord.server, { size: 25, weight: 600 })}
    ${text(211, 261, discord.textChannels, { size: 18, fill: subtle })}
    ${rect(200, 281, 217, 48, '#3f4248', 7)}
    ${text(213, 312, `#  ${discord.channel}`, { size: 24 })}
    ${text(213, 374, `#  ${discord.games}`, { size: 24, fill: subtle })}
    ${text(213, 436, `#  ${discord.offTopic}`, { size: 24, fill: subtle })}
    ${text(211, 522, discord.voiceChannels, { size: 18, fill: subtle })}
    ${text(213, 569, discord.gameCall, { size: 22, fill: subtle })}
    ${rect(188, 850, 241, 89, '#242529')}
    <circle cx="233" cy="895" r="22" fill="#6391b5"/>
    ${text(233, 902, 'Y', { size: 21, anchor: 'middle' })}
    ${text(266, 894, 'Yuki', { size: 21 })}
    ${text(266, 917, discord.online, { size: 15, fill: subtle })}
    <path d="M431 219H1820M471 266H899M1020 266H1772" stroke="#414349" stroke-width="2"/>
    ${text(469, 184, `#  ${discord.channel}`, { size: 27, weight: 650 })}
    ${text(756, 183, discord.topic, { size: 20, fill: subtle })}
    ${text(1730, 189, '⋯', { size: 24, anchor: 'middle', fill: subtle })}
    ${text(960, 268, discord.today, { size: 19, anchor: 'middle', fill: subtle })}
    <circle cx="502" cy="345" r="31" fill="#b786ac"/>
    ${text(502, 354, 'H', { size: 29, anchor: 'middle' })}
    ${text(556, 337, 'Haru', { size: 26, fill: '#e5b9dc', weight: 600 })}
    ${text(648, 337, `${discord.today}  20:30`, { size: 18, fill: subtle })}
    ${text(556, 385, chatSource, { size: 34, lang: 'ja' })}
    ${text(556, 438, `${translation.label} · ${translation.incoming}`, { size: 31, fill: '#69dfb1', lang: targetLang })}
    ${pill(1544, 754, 180, translation.replyPair, { size: 23, background: '#245643', fill: '#d7faec' })}
    ${rect(470, 810, 1303, 91, '#3b3d44', 7)}
    <circle cx="505" cy="845" r="16" fill="#b9bbc4"/>
    ${text(505, 854, '+', { size: 22, anchor: 'middle', fill: '#313338' })}
    ${text(544, 847, translation.reply, { size: 25, fill: subtle, lang: targetLang })}
    ${text(544, 882, replySource, { size: 29, lang: 'ja' })}
    ${text(108, 1015, discord.step, { size: 30, fill: '#d6efe6' })}
    ${text(1728, 1013, discord.workflow, { size: 21, fill: subtle, anchor: 'end' })}
  `;
}

function enhancePoster(video, locale, kind) {
  const frame = document.createElement('div');
  frame.className = 'demo-frame';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'demo-poster';
  button.setAttribute('aria-label', `${locale.play} · ${video.getAttribute('aria-label')}`);

  if (kind === 'stream') {
    const original = document.createElement('img');
    original.src = video.poster;
    original.alt = '';
    original.loading = 'lazy';
    button.append(original);
  }

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('viewBox', '0 0 1920 1080');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('lang', document.documentElement.lang);
  overlay.innerHTML = kind === 'stream' ? streamOverlay(locale) : discordOverlay(locale);
  button.append(overlay);

  const playIcon = document.createElement('span');
  playIcon.className = 'demo-play-icon';
  playIcon.setAttribute('aria-hidden', 'true');
  button.append(playIcon);

  const summary = document.createElement('div');
  summary.id = `${kind}-poster-summary`;
  summary.className = 'demo-poster-summary';
  button.setAttribute('aria-describedby', summary.id);
  const [original, translated] = kind === 'stream'
    ? [streamSource[0], locale.translation.stream[0]]
    : [chatSource, locale.translation.incoming];
  for (const [lang, value] of [['ja', original], [locale.targetLang, translated]]) {
    const line = document.createElement('p');
    line.lang = lang;
    line.textContent = value;
    summary.append(line);
  }

  video.before(frame);
  frame.append(video, button);
  frame.after(summary);

  const showPlayer = () => {
    if (!button.isConnected) return;
    const restoreFocus = document.activeElement === button;
    button.remove();
    summary.remove();
    video.inert = false;
    if (restoreFocus) video.focus({ preventScroll: true });
  };

  video.inert = true;
  video.addEventListener('playing', showPlayer, { once: true });
  button.addEventListener('click', async () => {
    try {
      await video.play();
    } catch {
      showPlayer();
    }
  });
}

const locale = locales[document.documentElement.lang];
if (locale) {
  const stream = document.querySelector('#demo video[poster]');
  const chat = document.querySelector('#chat-demo video[poster]');
  if (stream) enhancePoster(stream, locale, 'stream');
  if (chat) enhancePoster(chat, locale, 'chat');
}
