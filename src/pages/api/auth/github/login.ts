import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { serialize } from 'cookie';

// Store states temporarily (in production, use Redis or similar)
const stateStore = new Map<string, boolean>();

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
    return res.redirect('/contribution-report');
  }

  if (!clientId) {
    return res.status(500).json({ error: 'GitHub client ID not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, true);
  
  const scopes = ['repo', 'read:org', 'read:user'];
  const callback_uri = `${process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`}/api/auth/callback/github`;
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callback_uri)}&scope=${scopes.join('%20')}&state=${state}`;
  
  res.redirect(url);
}