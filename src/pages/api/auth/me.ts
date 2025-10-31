import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.cookies['gh_token'];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    if (!userRes.ok) {
      const text = await userRes.text();
      return res.status(401).json({ error: 'Invalid token', detail: text });
    }

    const user = await userRes.json();
    return res.json({
      login: user.login,
      avatarUrl: user.avatar_url,
    });
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}