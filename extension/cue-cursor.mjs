import {completeSentence, unfinishedSentence} from './sentence-boundary.mjs';

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

const ccQuietMs = 550;
const ccMaxWaitMs = 1400;
const ccMaxChars = 120;
const ccEndPunctuation = /[。！？.!?]+[」』”"）)]*$/u;
const ccKey = text => text.replace(ccEndPunctuation, '').trimEnd();

function extendsCue(previous, next) {
 if (next.startsWith(previous)) return true;
 // Rolling CC can revise the last word, or remove words before inserting a
 // correction. Require a real common prefix before treating it as one cue.
 let matched = 0;
 while (matched < previous.length && matched < next.length && previous[matched] === next[matched]) matched++;
 return matched >= 4 && matched >= Math.min(previous.length, next.length) * .6;
}

// Consecutive player snapshots are revisions of the same cue until it settles.
// Specs and production supply a monotonic local time so the bounds are testable.
export class RollingCaptionBuffer {
 constructor() { this.reset(); }

 reset() {
  this.pending = null;
  this.lastSnapshot = '';
  this.lastCommitted = '';
  this.lastOutput = '';
 }

 flush() {
  const text = this.pending?.text;
  this.pending = null;
  if (!text || ccKey(this.lastSnapshot) === ccKey(this.lastCommitted)) return [];
  this.lastCommitted = this.lastSnapshot;
  this.lastOutput = text;
  return [text];
 }

 update(snapshot, now, language) {
  const visible = String(snapshot || '').replace(/\s+/g, ' ').trim();
  if (!visible) {
   const finished = this.flush();
   this.reset();
   return finished;
  }

  const finished = [];
  if (visible !== this.lastSnapshot) {
   const previous = this.lastSnapshot;
   const continuing = extendsCue(previous, visible);
   const tail = this.lastOutput;
   const shiftedPastCommitted = tail && previous.endsWith(tail) &&
     (ccKey(visible) === ccKey(tail) || (completeSentence(tail, language) && visible.startsWith(tail)));
   const pendingText = this.pending?.text;
   const shiftedToPending = pendingText && previous.endsWith(pendingText) && visible.startsWith(pendingText);
   if (!continuing && shiftedPastCommitted) {
    // Two-line CC windows discard the older line as a new one arrives.
    this.lastCommitted = tail;
   } else if (!continuing && shiftedToPending) {
    this.lastCommitted = '';
   } else if (!continuing) {
    finished.push(...this.flush());
    this.lastCommitted = '';
    this.lastOutput = '';
   }
   this.lastSnapshot = visible;
   // Drop a translated prefix only if the latest snapshot preserves its
   // sentence terminator. A rewritten ending can change the whole meaning.
   const prefix = this.lastCommitted;
   const text = prefix && completeSentence(prefix, language) && visible.startsWith(prefix)
    ? visible.slice(prefix.length).trimStart()
    : visible;
   if (text && ccKey(visible) !== ccKey(this.lastCommitted)) {
    this.pending = {text, startedAt: this.pending?.startedAt ?? now, changedAt: now};
   } else {
    this.pending = null;
   }
  }

  const cue = this.pending;
  if (cue && (completeSentence(cue.text, language) || visible.length - this.lastCommitted.length >= ccMaxChars ||
      now - cue.changedAt >= ccQuietMs || now - cue.startedAt >= ccMaxWaitMs)) {
   finished.push(...this.flush());
  }
  return finished;
 }
}
