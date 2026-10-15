// Edit this one file to change the internal credit unit and default session budget.
export const creditConfig={usdPerCredit:0.01,defaultSessionLimitCredits:100,warningRatio:0.8,catalogCacheSeconds:10800,defaultOutputTokens:512,maxOutputTokens:4096,sessionTtlSeconds:7*86400} as const;
export const chatSystem='You are a helpful conversational assistant. Reply in the language used by the user. Be honest about uncertainty. This is a text-only chat: you cannot generate files, images, videos, access URLs or invoke tools. Do not claim you have performed external actions.';
export function credits(usd:number){return usd/creditConfig.usdPerCredit;}
export function money(usd:number){return new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',minimumFractionDigits:usd>0&&usd<0.01?6:2,maximumFractionDigits:6}).format(usd);}
export function creditLabel(usd:number){return `${new Intl.NumberFormat('es-AR',{maximumFractionDigits:5}).format(credits(usd))} créditos (${money(usd)})`;}
