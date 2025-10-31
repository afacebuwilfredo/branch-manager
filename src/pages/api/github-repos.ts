import type { NextApiRequest, NextApiResponse } from 'next';

type Repo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description?: string | null;
  updated_at?: string;
};

async function fetchAll(url: string, token: string) {
  const perPage = 100;
  let page = 1;
  const results: Repo[] = [];

  while (true) {
    const res = await fetch(`${url}?per_page=${perPage}&page=${page}&type=all`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
    });

    if (res.status === 404) {
      // no such resource
      return { ok: false, status: 404, data: null };
    }

    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, status: res.status, data: txt };
    }

    const json = (await res.json()) as Repo[];
    if (!Array.isArray(json)) {
      return { ok: false, status: 500, data: 'Unexpected response format' };
    }

    results.push(...json.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      html_url: r.html_url,
      description: r.description,
      updated_at: r.updated_at,
    })));

    if (json.length < perPage) break;
    page += 1;
  }

  return { ok: true, status: 200, data: results };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.method === 'GET' ? req.query : req.body;
  const owner = typeof body.owner === 'string' ? body.owner : (body.owner ?? undefined);
  if (!owner || typeof owner !== 'string') return res.status(400).json({ ok: false, error: 'Missing owner parameter' });

  const token = process.env.GITHUB_TOKEN || process.env.GITHUBTOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'Server GITHUB_TOKEN not configured' });

  try {
    // Try user repos first
    const userUrl = `https://api.github.com/users/${encodeURIComponent(owner)}/repos`;
    const userResp = await fetchAll(userUrl, token);
    if (userResp.ok) return res.status(200).json({ ok: true, data: userResp.data });

    // If user not found (404), try org repos
    if (userResp.status === 404) {
      const orgUrl = `https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`;
      const orgResp = await fetchAll(orgUrl, token);
      if (orgResp.ok) return res.status(200).json({ ok: true, data: orgResp.data });
      return res.status(orgResp.status).json({ ok: false, error: orgResp.data });
    }

    // Other errors
    return res.status(userResp.status).json({ ok: false, error: userResp.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: message });
  }
}
