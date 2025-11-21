import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { serialize } from 'cookie';

// Store states temporarily (in production, use Redis or similar)
const stateStore = new Map<string, boolean>();

const resolveBaseUrl = (req: NextApiRequest) => {
  const envUrl = process.env.NEXTAUTH_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host;

  if (!forwardedHost) {
    throw new Error('Unable to resolve base URL for OAuth redirect');
  }

  return `${forwardedProto}://${forwardedHost}`;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const useLocalToken = process.env.USE_LOCAL_TOKEN === 'true';
  const localGithubToken = process.env.LOCAL_GITHUB_TOKEN || process.env.GITHUBTOKEN;

  if (useLocalToken && localGithubToken) {
    // Dev shortcut: set cookie and redirect back
    res.setHeader('Set-Cookie', serialize('gh_token', localGithubToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600, // 7 days
    }));
    return res.redirect('/');
  }

  if (!clientId) {
    return res.status(500).json({ error: 'GitHub client ID not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, true);
  
  const scopes = ['repo', 'read:org', 'read:user'];
  const callbackBase = resolveBaseUrl(req);
  const callbackUri = `${callbackBase}/api/auth/callback/github`;
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUri)}&scope=${scopes.join('%20')}&state=${state}`;
  // Ensure the GitHub OAuth App has the same redirect URL registered (especially for Vercel deployments).
  
  res.redirect(url);
}