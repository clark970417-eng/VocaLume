import {unfinishedSentence} from './sentence-boundary.mjs';

// Keep all recognized clauses until their translation has actually been shown.
// A rolling ASR result may contain several sentences on its very first update.
export class CueCursor {
 constructor(){this.reset();}
 reset(){this.id=null;this.delivered=null;}
 markDelivered(id,fullText,shownText){
  if(id!==this.id||!fullText||!shownText)return;
  this.delivered={fullText,shownText};
 }
 select(text,id){
  if(id!==this.id){this.id=id;this.delivered=null;}
  const delivered=this.delivered;
  if(!delivered||!/[。！？.!?][」』）)]*$/u.test(delivered.shownText.trim()))return text.trim();
  let normalized='',prefix='';const positions=[];
  for(let i=0;i<text.length;i++)if(!/[\p{P}\s]/u.test(text[i])){normalized+=text[i];positions.push(i);}
  prefix=delivered.fullText.replace(/[\p{P}\s]/gu,'');
  // If the recognizer revised an earlier word, do not guess which text was
  // already translated: return the complete hypothesis for correction.
  if(!prefix||!normalized.startsWith(prefix))return text.trim();
  const next=normalized.slice(prefix.length);
  if(!next)return delivered.shownText;
  // A short or dependent ending may negate/reverse an apparently complete
  // first hypothesis. Translate it with the prior context rather than dropping
  // it or treating an orphan suffix as a complete new sentence.
  if(next.length<4||unfinishedSentence(delivered.shownText)||/^(?:つもり|予定|わけ|はず)(?:は|が|じゃ|では|です|だ|で|も|な)/u.test(next))return text.trim();
  return text.slice(positions[prefix.length]).trim();
 }
}
