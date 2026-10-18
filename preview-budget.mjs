// Optional rolling recognition must leave idle time after slow inference.
// Final utterances never pass through this admission policy.
export class PreviewBudget {
 constructor(){this.completedAt=null;this.durationMs=0;this.averageMs=0;}
 complete(durationMs,now){
  if(!Number.isFinite(durationMs)||durationMs<0||!Number.isFinite(now))return;
  this.completedAt=now;this.durationMs=durationMs;
  this.averageMs=this.averageMs ? .75*this.averageMs+.25*durationMs : durationMs;
 }
 remainingMs(now,pressure={}){
  if(pressure.previewsPaused)return Infinity;
  if(this.completedAt===null)return 0;
  const duty=pressure.previewDutyCycle??.85;
  const rest=this.durationMs>=250||duty<.85?this.durationMs*(1/duty-1):0;
  return Math.max(0,this.completedAt+rest-now,this.completedAt-this.durationMs+(pressure.previewFloorMs||0)-now);
 }
 intervalMs(pressure={}){
  if(pressure.previewsPaused)return Infinity;
  // No 2.5-second ceiling: a five-second decode needs more than five seconds
  // between optional previews. Acoustic final boundaries remain independent.
  return Math.max(500,pressure.previewFloorMs||0,this.averageMs/(pressure.previewDutyCycle??.85));
 }
}
