import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
// Kie-hosted result URLs only: HTTPS, an allow-listed host and public IP addresses (no SSRF to internal networks).
function privateIP(ip:string){return /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)||ip==='::1'||ip==='::'||/^ff/i.test(ip)||/^(fc|fd|fe80)/i.test(ip)||ip.startsWith('::ffff:');}
// The hosts Kie's documentation shows in result links (most models answer from tempfile.aiquickdraw.com).
// ASSET_ALLOWED_HOSTS adds hosts; it no longer replaces these, so an old setting cannot block Kie's own results.
export const kieResultHosts=['file.aiquickdraw.com','tempfile.aiquickdraw.com'];
export const allowedAssetHosts=()=>[...new Set([...kieResultHosts,...(process.env.ASSET_ALLOWED_HOSTS||'').split(',').map(v=>v.trim()).filter(Boolean)])];
export async function approvedAssetURL(value:string){const url=new URL(value);const allowed=allowedAssetHosts();if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(url.hostname)||!allowed.includes(url.hostname))throw Error('ASSET_HOST_NOT_ALLOWED');const ips=await lookup(url.hostname,{all:true});if(!ips.length||ips.some(v=>privateIP(v.address)))throw Error('ASSET_HOST_NOT_ALLOWED');return url;}
