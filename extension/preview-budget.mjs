// Optional rolling recognition must leave idle time after slow inference.
// Final utterances never pass through this admission policy.
export class PreviewBudget {
 constructor(){this.completedAt=null;this.durationMs=0;this.averageMs=0;this.resetSource();}
 resetSource(){this.source='';this.repeats=0;}
 observeSource(text,final=false){
  if(final){this.resetSource();return;}
  const source=String(text||'').replace(/[\p{P}\s]/gu,'');
  if(!source){this.resetSource();return;}
  this.repeats=source===this.source?Math.min(3,this.repeats+1):0;
  this.source=source.slice(0,1024);
 }
 // Repeated unchanged hypotheses need fewer speculative refreshes. This only
 // spaces optional work: final capture boundaries and their admission bypass it.
 stableFloorMs(){return this.repeats>=2?Math.min(1100,500+this.repeats*200):0;}
 complete(durationMs,now){
  if(!Number.isFinite(durationMs)||durationMs<0||!Number.isFinite(now))return;
  this.completedAt=now;this.durationMs=durationMs;
  this.averageMs=this.averageMs ? .75*this.averageMs+.25*durationMs : durationMs;
 }
 dutyCycle(pressure={}){
  // Slow repeated decoding can saturate a fanless machine before the OS reports
  // heat. Reserve more idle time for translation as measured inference grows.
  const sustainable=this.averageMs>=3500?.5:this.averageMs>=1800?.65:.85;
  return Math.min(pressure.previewDutyCycle??.85,sustainable);
 }
 remainingMs(now,pressure={}){
  if(pressure.previewsPaused)return Infinity;
  if(this.completedAt===null)return 0;
  const duty=this.dutyCycle(pressure);
  const rest=this.durationMs>=250||duty<.85?this.durationMs*(1/duty-1):0;
  return Math.max(0,this.completedAt+rest-now,this.completedAt-this.durationMs+Math.max(pressure.previewFloorMs||0,this.stableFloorMs())-now);
 }
 intervalMs(pressure={}){
  if(pressure.previewsPaused)return Infinity;
  // No 2.5-second ceiling: a five-second decode needs more than five seconds
  // between optional previews. Acoustic final boundaries remain independent.
  return Math.max(500,pressure.previewFloorMs||0,this.stableFloorMs(),this.averageMs/this.dutyCycle(pressure));
 }
}
