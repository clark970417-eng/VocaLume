import { expect, it } from 'vitest'
import { japaneseChineseInstruction } from './japanese-chinese-prompt'
import { selectDraftTerminology } from './draft-glossary'
it('does not force general Chinese messages into a viewer persona or canned phrase', () => {
  const prompt = japaneseChineseInstruction('zh', 'ja')
  expect(prompt).toContain('保持原文的语气')
  expect(prompt).not.toContain('这是观众')
  expect(japaneseChineseInstruction('zh', 'ja', 'viewer')).toContain('这是观众')
  expect(japaneseChineseInstruction('zh', 'ja', 'polite')).toContain('です／ます')
})
it('offers platform-specific homonyms only with platform evidence', () => {
  expect(selectDraftTerminology('我要訂閱報紙，剪輯這部電影').map(t => t.source)).not.toContain('訂閱')
  expect(selectDraftTerminology('我要訂閱報紙，剪輯這部電影').map(t => t.source)).not.toContain('剪輯')
  expect(selectDraftTerminology('訂閱你的直播頻道').map(t => t.source)).toContain('訂閱')
})
