export function protectNames(text: string, glossary?: Array<{source:string;target:string}>): {
  text: string; body: string;
  entries: Array<{source:string;target:string;token:string;start:number;end:number}>;
  restore(value:string):string; restorePartial(value:string):string;
};
export function alreadyTargetLanguage(text:string, from:string, to:string):boolean;
export function shouldTranslateReading(text:string, from:string, to:string):boolean;
export function isNonLinguisticText(text:string):boolean;
