import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {manifestSchema,skillIds,type SkillId} from './schemas';
export async function loadSkill(id:SkillId){if(!skillIds.includes(id))throw Error('UNKNOWN_SKILL');const root=path.join(process.cwd(),'skills',id);const [manifest,instructions]=await Promise.all([readFile(path.join(root,'manifest.json'),'utf8'),readFile(path.join(root,'SKILL.md'),'utf8')]);const parsed=manifestSchema.parse(JSON.parse(manifest));if(parsed.name!==id)throw Error('SKILL_NAME_MISMATCH');return {manifest:parsed,instructions};}
export async function skillList(){return Promise.all(skillIds.map(async id=>(await loadSkill(id)).manifest));}
