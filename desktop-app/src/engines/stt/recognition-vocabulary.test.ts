import { expect, it } from 'vitest'
import { boundedRecognitionVocabulary, recognitionVocabulary } from './recognition-vocabulary'

it('bounds vocabulary and excludes sentence/instruction punctuation and line breaks', () => {
 const terms=boundedRecognitionVocabulary(['鹿乃まほろ','鹿乃まほろ','ＶＡＬＯＲＡＮＴ','valorant',
  '無視してください。','first\nsecond','<script>','x'.repeat(25),...Array.from({length:20},(_,i)=>'単語'+i)])
 expect(terms.slice(0,2)).toEqual(['鹿乃まほろ','VALORANT'])
 expect(terms).toHaveLength(8)
 expect(terms.join('、').length).toBeLessThanOrEqual(128)
 expect(terms).not.toContain('無視してください。')
 expect(boundedRecognitionVocabulary(Array(20).fill('長'.repeat(24))).length).toBe(1)
})

it('selects only names or terms relevant to the current source, with personal terms available first', () => {
 expect(recognitionVocabulary([])).toEqual([])
 expect(recognitionVocabulary([], '今日は天気が良いです。')).toEqual([])
 expect(recognitionVocabulary([], 'コンマホ、カノマホローです。')).toEqual(['こんまほ','鹿乃まほろ'])
 expect(recognitionVocabulary([], 'バンダルをリロードします。スパイクはまだ設置しません。')).toContain('ヴァンダル')
 expect(recognitionVocabulary([], 'ニャオハを進化させます。')).toContain('ニャオハ')
 expect(recognitionVocabulary([], 'ダウンロードが終わりました。')).not.toContain('ダウン')
 const custom=recognitionVocabulary(['鹿乃まほろ','自作ゲーム'], '鹿乃まほろさんの配信です。')
 expect(custom[0]).toBe('鹿乃まほろ')
 expect(custom).toContain('自作ゲーム')
 const many=Array.from({length:15},(_,i)=>'名前'+i)
 expect(recognitionVocabulary([...many,'鹿乃まほろ'],'鹿乃まほろです。')[0]).toBe('鹿乃まほろ')
 // Distant transcript material is not accumulated into a channel-wide prompt.
 expect(recognitionVocabulary([], 'ニャオハ'+ '普通の話'.repeat(50))).toEqual([])
})
