import {expect,it} from 'vitest'
import {multilingualTranslationInstruction} from './multilingual-prompt'
import {LANG_NAMES_ZH} from '../engines/language-names'

it('does not force Chinese output when translating Chinese to another language',()=>{
  for(const target of ['en','ko','es','fr','de','pt','it','ru','th','vi','id','ar']){
    const prompt=multilingualTranslationInstruction('zh',target)!
    expect(prompt).toContain(LANG_NAMES_ZH[target])
    expect(prompt).not.toContain('繁体中文')
    expect(prompt).not.toContain('繁體中文')
  }
})
it('provides the chosen source language rather than guessing from a short homonym',()=>{
  expect(multilingualTranslationInstruction('de','zh')).toContain('德语')
  for(const source of ['en','ko','es','fr','de','pt','it','ru','th','vi','id','ar']){
    expect(multilingualTranslationInstruction(source,'zh')).toContain(LANG_NAMES_ZH[source])
  }
})
it('keeps the Japanese/Chinese-specific templates selected',()=>{
  expect(multilingualTranslationInstruction('ja','zh')).toBeUndefined()
  expect(multilingualTranslationInstruction('zh','ja')).toBeUndefined()
  expect(multilingualTranslationInstruction('ja','en')).toBeUndefined()
})
it('preserves only the actual name markers used in a Chinese source',()=>{
  const prompt=multilingualTranslationInstruction('zh','ru','[VNAME0]和[VNAME1]明天來。')!
  expect(prompt).toContain('[VNAME0]、[VNAME1]')
  expect(prompt).not.toContain('[NAME0]')
  expect(multilingualTranslationInstruction('zh','ru','明天來。')).not.toContain('标记')
})
