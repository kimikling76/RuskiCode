'use client';
import {useId, type ReactNode} from 'react';
import type {LookKey} from '@/lib/cinema/studio-looks';

// The small pictures of the four looks: drawn here, one per option, so a chip shows what it adds to the scene (the
// palette's own colours, the light's sky, the shot's framing, the film's frame). Decorative: the option's name is
// always written next to them.

const palettes: Record<string, string[]> = {
  auto: ['#8C7A4A', '#3F6F66', '#4E5A86', '#7E4A62'],
  warm: ['#FFD166', '#F4A259', '#E76F51', '#9C4A2F'],
  cool: ['#CDE4F2', '#98C1D9', '#3D5A80', '#293241'],
  teal: ['#2EC4B6', '#0F7C8C', '#FF8C42', '#FFB677'],
  pastel: ['#FFD6E0', '#FFF1B8', '#C3F0CA', '#CDE7FF'],
  mono: ['#F0F0F0', '#A3A3A3', '#5C5C5C', '#E24A3B'],
  vivid: ['#FF006E', '#FFBE0B', '#3A86FF', '#8338EC'],
};

function Film({id, g}: {id: string; g: (n: string) => string}) {
  const frame: Record<string, [string, string]> = {
    auto: ['#4A4A50', '#26262A'], '35mm': ['#E2A963', '#6E3F1F'], '16mm': ['#B89062', '#3E2E20'],
    digital: ['#62B6FF', '#1E3A8A'], anamorphic: ['#16223A', '#0A101C'], bw: ['#F2F2F2', '#262626'],
  };
  const [a, b] = frame[id] || frame.auto;
  const inset = id === '16mm' ? 4 : 0;
  const tall = id === 'anamorphic' ? 7 : 0;
  return (
    <>
      <defs><linearGradient id={g('f')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <rect width="40" height="40" fill="#111113" />
      {[3, 11, 19, 27, 35].map(x => <g key={x}><rect x={x - 2} y="2.5" width="4" height="3.5" rx="0.8" fill="#3A3A3F" /><rect x={x - 2} y="34" width="4" height="3.5" rx="0.8" fill="#3A3A3F" /></g>)}
      <rect x={2 + inset} y={9 + inset + tall} width={36 - inset * 2} height={22 - inset * 2 - tall * 2} rx="1.5" fill={`url(#${g('f')})`} />
      {id === 'anamorphic' ? <><rect x="3" y="19.4" width="34" height="1.2" rx="0.6" fill="#7FD3FF" opacity="0.9" /><circle cx="22" cy="20" r="2.4" fill="#BFEAFF" /></> : null}
      {id === 'digital' ? <path d="M8 26 L16 18 L21 23 L26 17 L33 26 Z" fill="#BFE0FF" opacity="0.55" /> : null}
      {id === '35mm' || id === '16mm' ? <circle cx="27" cy="16" r="3" fill="#FFE3B0" opacity="0.7" /> : null}
      {id === 'bw' ? <path d="M6 28 L15 19 L22 25 L28 20 L34 28 Z" fill="#7A7A7A" /> : null}
    </>
  );
}

function Camera({id, g}: {id: string; g: (n: string) => string}) {
  const sky = <><defs><linearGradient id={g('s')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A3E57" /><stop offset="1" stopColor="#101821" /></linearGradient></defs><rect width="40" height="40" fill={`url(#${g('s')})`} /></>;
  const ink = '#A9D2F5';
  if (id === 'close') return <>{sky}<circle cx="20" cy="17" r="8" fill={ink} /><path d="M4 40 C6 29 13 26 20 26 C27 26 34 29 36 40 Z" fill={ink} /></>;
  if (id === 'wide') return <>{sky}<path d="M0 29 L10 21 L17 26 L26 17 L40 28 L40 40 L0 40 Z" fill="#1C2B3C" /><rect x="0" y="30" width="40" height="10" fill="#22364C" /><circle cx="21" cy="26.5" r="1.4" fill={ink} /><rect x="20.2" y="27.8" width="1.6" height="3.2" rx="0.6" fill={ink} /></>;
  if (id === 'drone') return <><rect width="40" height="40" fill="#18232F" /><path d="M0 14 H40 M0 27 H40 M13 0 V40 M28 0 V40" stroke="#3E5670" strokeWidth="3" /><rect x="16" y="17" width="9" height="7" rx="1" fill={ink} /><rect x="3" y="3" width="7" height="8" rx="1" fill="#5E7E9E" /><rect x="31" y="30" width="6" height="7" rx="1" fill="#5E7E9E" /></>;
  if (id === 'dolly') return <>{sky}<path d="M8 40 L18 24 M32 40 L22 24" stroke="#5E7E9E" strokeWidth="1.6" /><path d="M11 35 H29 M14 30 H26 M16.5 26.5 H23.5" stroke="#5E7E9E" strokeWidth="1.2" /><circle cx="20" cy="13" r="3.2" fill={ink} /><path d="M15 24 C15 19 17 17.5 20 17.5 C23 17.5 25 19 25 24 Z" fill={ink} /></>;
  if (id === 'handheld') return <>{sky}<g transform="rotate(-9 20 20)"><rect x="5" y="7" width="30" height="26" rx="2" fill="none" stroke="#5E7E9E" strokeWidth="1.4" strokeDasharray="3 2" /><circle cx="20" cy="17" r="4" fill={ink} /><path d="M12 33 C13 25 16 23 20 23 C24 23 27 25 28 33 Z" fill={ink} /></g></>;
  if (id === 'low') return <>{sky}<path d="M13 40 L17 14 L23 14 L27 40 Z" fill={ink} /><circle cx="20" cy="10" r="3" fill={ink} /><path d="M0 40 L40 40 L40 37 L0 39 Z" fill="#22364C" /></>;
  return (
    <>
      <defs><radialGradient id={g('l')} cx="0.4" cy="0.35" r="0.7"><stop offset="0" stopColor="#5B8CC4" /><stop offset="0.55" stopColor="#14263D" /><stop offset="1" stopColor="#070B12" /></radialGradient></defs>
      <rect width="40" height="40" fill="#15191F" />
      <circle cx="20" cy="20" r="15" fill="#2A3340" /><circle cx="20" cy="20" r="11.5" fill="#0B0F14" /><circle cx="20" cy="20" r="9" fill={`url(#${g('l')})`} />
      <circle cx="16.5" cy="16" r="2.2" fill="#FFFFFF" opacity="0.75" /><circle cx="23.5" cy="24" r="1" fill="#FFFFFF" opacity="0.4" />
    </>
  );
}

function Palette({id}: {id: string}) {
  const c = palettes[id] || palettes.auto;
  return <><rect width="40" height="40" fill="#111113" />{c.map((color, k) => <rect key={k} x={2 + k * 9.25} y="2" width="8.5" height="36" rx="2" fill={color} opacity={id === 'auto' ? 0.7 : 1} />)}</>;
}

function Light({id, g}: {id: string; g: (n: string) => string}) {
  const grad = (stops: [string, string][], vertical = true) => (
    <linearGradient id={g('b')} x1="0" y1="0" x2={vertical ? '0' : '1'} y2="1">{stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}</linearGradient>
  );
  const glow = (key: string, color: string) => <radialGradient id={g(key)}><stop offset="0" stopColor={color} stopOpacity="0.95" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>;
  const scenes: Record<string, ReactNode> = {
    golden: <><defs>{grad([['0', '#FFB347'], ['0.55', '#F0643A'], ['1', '#4E2346']])}{glow('g', '#FFE29A')}</defs><rect width="40" height="40" fill={`url(#${g('b')})`} /><circle cx="20" cy="27" r="14" fill={`url(#${g('g')})`} /><circle cx="20" cy="27" r="5" fill="#FFEFC2" /><rect y="29" width="40" height="11" fill="#3B1A33" /></>,
    neon: <><defs>{glow('m', '#FF2BD6')}{glow('c', '#22E4FF')}</defs><rect width="40" height="40" fill="#120A24" /><circle cx="9" cy="13" r="17" fill={`url(#${g('m')})`} /><circle cx="33" cy="29" r="17" fill={`url(#${g('c')})`} /><rect x="6" y="31" width="28" height="1.6" rx="0.8" fill="#FF7BEA" /></>,
    lowkey: <><defs>{glow('k', '#F4F1EA')}</defs><rect width="40" height="40" fill="#09090A" /><circle cx="6" cy="18" r="20" fill={`url(#${g('k')})`} opacity="0.45" /><circle cx="22" cy="17" r="7" fill="#1A1A1C" /><path d="M15 17 A7 7 0 0 1 22 10 L22 24 A7 7 0 0 1 15 17 Z" fill="#CFCAC0" /><path d="M8 40 C10 30 16 27 22 27 C28 27 33 30 35 40 Z" fill="#161618" /></>,
    soft: <><defs>{grad([['0', '#EAF1F8'], ['1', '#AFC2D6']])}{glow('s', '#FFFFFF')}</defs><rect width="40" height="40" fill={`url(#${g('b')})`} /><circle cx="27" cy="12" r="14" fill={`url(#${g('s')})`} /><rect y="30" width="40" height="10" fill="#9DB3C9" /></>,
    backlight: <><defs>{glow('h', '#FFF3C4')}</defs><rect width="40" height="40" fill="#2B2418" /><circle cx="20" cy="18" r="19" fill={`url(#${g('h')})`} /><circle cx="20" cy="14" r="4.5" fill="#0E0C09" /><path d="M11 40 C12 27 16 21 20 21 C24 21 28 27 29 40 Z" fill="#0E0C09" /></>,
    night: <><defs>{grad([['0', '#0A1631'], ['1', '#1E3F72']])}</defs><rect width="40" height="40" fill={`url(#${g('b')})`} /><circle cx="27" cy="12" r="5.5" fill="#E8F0FF" /><circle cx="29.5" cy="10.5" r="5" fill="#0F2148" /><circle cx="8" cy="8" r="0.8" fill="#E8F0FF" /><circle cx="14" cy="15" r="0.6" fill="#E8F0FF" /><circle cx="34" cy="24" r="0.7" fill="#E8F0FF" /><path d="M0 33 L12 27 L22 31 L40 25 L40 40 L0 40 Z" fill="#081127" /></>,
  };
  return scenes[id] || <><defs>{grad([['0', '#30333C'], ['1', '#16181D']])}</defs><rect width="40" height="40" fill={`url(#${g('b')})`} /><circle cx="20" cy="18" r="6" fill="none" stroke="#9EA3AD" strokeWidth="1.6" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="19.2" y="7" width="1.6" height="3.4" rx="0.8" fill="#9EA3AD" transform={`rotate(${a} 20 18)`} />)}<rect y="31" width="40" height="9" fill="#202329" /></>;
}

/** The picture of one look's option. `id` is the option's id (`auto` included). */
export function LookThumb({look, id}: {look: LookKey; id: string}) {
  const uid = useId().replace(/:/g, '');
  const g = (n: string) => uid + n;
  return (
    <svg className="rc-es-thumb" viewBox="0 0 40 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {look === 'film' ? <Film id={id} g={g} /> : look === 'camera' ? <Camera id={id} g={g} /> : look === 'palette' ? <Palette id={id} /> : <Light id={id} g={g} />}
    </svg>
  );
}
