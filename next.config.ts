import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, outputFileTracingIncludes: { "/api/skills": ["./skills/**/*"], "/api/skills/run": ["./skills/**/*"], "/api/chat": ["./skills/**/*"] } };
export default config;
