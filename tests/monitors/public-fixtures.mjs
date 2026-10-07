export function publicSession(value='synthetic-public-token', now=Date.now()) {
 return {mode:'public',version:1,anonId:'synthetic-anonymous-id',cookies:[{name:'access_token_web',value,domain:'vinted.co.uk',hostOnly:false,path:'/',expiresAt:now+3600000}]};
}
