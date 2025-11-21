import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const useLocalToken = process.env.GITHUBTOKEN === 'true';
  const localGithubToken = process.env.GITHUB_TOKEN || process.env.GITHUBTOKEN;
  const token = useLocalToken && localGithubToken ? localGithubToken : req.cookies['gh_token'];

  if (!token) {
    return res.status(401).json({ error: 'No token; login required' });
  }
 
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    
    // Forward status and response
    res.status(response.status).send(text);
  } catch (error) {
    console.error('GraphQL proxy error:', error);
    res.status(500).json({ error: 'GraphQL proxy failed' });
  }
}