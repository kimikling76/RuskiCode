import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
// Kie-hosted result URLs only: HTTPS, an allow-listed host and public IP addresses (no SSRF to internal networks).
function privateIP(ip:string){return /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)||ip==='::1'||ip==='::'||/^ff/i.test(ip)||/^(fc|fd|fe80)/i.test(ip)||ip.startsWith('::ffff:');}
export async function approvedAssetURL(value:string){const url=new URL(value);const allowed=(process.env.ASSET_ALLOWED_HOSTS||'file.aiquickdraw.com').split(',').map(v=>v.trim()).filter(Boolean);if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(url.hostname)||!allowed.includes(url.hostname))throw Error('ASSET_HOST_NOT_ALLOWED');const ips=await lookup(url.hostname,{all:true});if(!ips.length||ips.some(v=>privateIP(v.address)))throw Error('ASSET_HOST_NOT_ALLOWED');return url;}
