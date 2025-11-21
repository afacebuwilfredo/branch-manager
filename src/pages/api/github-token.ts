import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  ok: boolean;
  token?: string;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GITHUBTOKEN;
  
  if (!token) {
    return res.status(500).json({ 
      ok: false, 
      error: "GitHub token not configured. Please set GITHUB_TOKEN in environment variables." 
    });
  }

  return res.status(200).json({ ok: true, token });
}