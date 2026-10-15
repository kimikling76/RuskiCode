export function studioAuthPolicy(bootstrap=false){return {
 emailAndPassword:{enabled:true,disableSignUp:!bootstrap,minPasswordLength:12,maxPasswordLength:128},
 user:{additionalFields:{role:{type:'string' as const,defaultValue:'admin',input:false}}},
 session:{expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},
 rateLimit:{enabled:true,storage:'database' as const,window:60,max:20},
};}
