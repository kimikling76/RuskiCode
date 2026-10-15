// Keep the allowlist and OAuth credentials on the server.
export function googleConfig(){
 const clientId=process.env.GOOGLE_CLIENT_ID?.trim();
 const clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim();
 const email=process.env.STUDIO_GOOGLE_EMAIL?.trim().toLowerCase();
 return clientId&&clientSecret&&email?{clientId,clientSecret,email}:null;
}
export function allowedGoogleIdentity(user:{email:string;emailVerified:boolean},email:string,requireVerified=true){
 return user.email.trim().toLowerCase()===email.trim().toLowerCase()&&(!requireVerified||user.emailVerified===true);
}
