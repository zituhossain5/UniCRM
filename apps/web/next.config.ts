import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootCandidates = [process.cwd(), resolve(process.cwd(), '../..')];
const repositoryRoot = rootCandidates.find((candidate) =>
  existsSync(resolve(candidate, 'pnpm-workspace.yaml')),
);

if (!repositoryRoot) {
  throw new Error('Unable to locate the UniCRM workspace root');
}

const { combinedEnv } = loadEnvConfig(
  repositoryRoot,
  process.env.NODE_ENV !== 'production',
  console,
  true,
);
const apiBaseUrl = combinedEnv.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is required in the root environment configuration');
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiBaseUrl,
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@unicrm/ui'],
};

export default nextConfig;
