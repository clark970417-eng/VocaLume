export type WritingStyle = 'general' | 'viewer' | 'polite'

/** Preserve the measured translation template; only the requested register changes. */
export function japaneseChineseInstruction(from: string, to: string, style: WritingStyle = 'general', text = ''): string {
  if (from === 'zh' && to === 'ja') {
    const register = style === 'viewer' ? '这是观众写给主播的留言，使用自然亲切、有礼貌的语气。'
      : style === 'polite' ? '使用自然的です／ます体。'
      : '保持原文的语气和礼貌程度，不预设人物关系。'
    const terms: Array<[string, string]> = [
      ['好聽', '素敵'], ['歌聲', '歌声'], ['辛苦了', 'お疲れさまでした'],
      ['排程', 'スケジュール'], ['直播', '配信'],
      ['不能待到結束', '最後までいられません'], ['不一定能來', '来られるとは限りません'],
      ['補精神', '元気をチャージ']
    ]
    const glossary = terms.filter(([source]) => text.includes(source)).map(([source, target]) => `${source} 翻译成 ${target}`).join('\n')
    return `时态参考：未来无法参加用「明日は参加できません」，昨天未能参加用「昨日は参加できませんでした」。不要输出这些参考句。\n${glossary ? '参考下面的翻译：\n' + glossary + '\n\n' : ''}将以下文本翻译为日语，${register}保持原文说话者视角，不把个人计划改为邀请或命令。完整保留原意、时态、否定、称呼和表情。只输出译文，不要额外解释：\n\n`
  }
  return '将以下文本翻译为中文，用自然流畅的台湾繁体中文口语；完整保留原意、否定、数字、时态和说话者。未说完的内容不要补完，不添加原文没有的信息。只输出译文，不要额外解释：\n\n'
}
