chrome.storage.local.get(['recordedCaptions']).then(({recordedCaptions:entries=[]})=>{
 const session=entries.at(-1)?.session;const latest=entries.filter(e=>e.session===session);
 document.querySelector('#result').textContent=JSON.stringify({entries:latest.length,groups:new Set(latest.map(e=>e.group)).size,completed:latest.filter(e=>e.state==='done'&&e.translated?.trim()).length,pending:latest.filter(e=>['pending','working','streaming'].includes(e.state)).length,failed:latest.filter(e=>e.state==='failed').length,emptyTranslations:latest.filter(e=>!e.translated?.trim()).length},null,2);
 for(const e of latest){const row=document.createElement('pre');row.textContent=JSON.stringify({cue:e.key.split(':').slice(-2).join(':'),state:e.state,sourceLength:e.original?.length,translationLength:e.translated?.length});document.body.append(row);}
});
