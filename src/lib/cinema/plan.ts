export type Plan = {title: string; script: string; shots: {title: string; description: string; prompt: string}[]};

/** Reads the storyboard JSON the chat model returns; anything unexpected becomes null, never a guess. */
export function parsePlan(text: string): Plan | null {
  try {
    const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
    const shots = Array.isArray(value?.shots) ? value.shots.slice(0, 12).map((s: Record<string, unknown>) => ({
      title: str(s?.title, 120), description: str(s?.description, 1200), prompt: str(s?.prompt, 4000),
    })).filter((s: {prompt: string}) => s.prompt) : [];
    if (!shots.length) return null;
    return {title: str(value.title, 120) || 'Plan sin título', script: str(value.script, 4000), shots};
  } catch {
    return null;
  }
}
