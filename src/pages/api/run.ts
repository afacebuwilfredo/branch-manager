// pages/api/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";

type Data = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
};

const COMMANDS: Record<string, string> = (() => {
  const isWin = process.platform === "win32";
  return {
    whoami: isWin ? "whoami" : "whoami",
    pwd: isWin ? "cd" : "pwd",
    list: isWin ? "dir" : "ls -la",
    branches: "git branch",
    folders: isWin ? "dir /AD /B" : "ls -d */",
  };
})();

export default function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { cmd, cwd } = req.body ?? {};
  if (typeof cmd !== "string" || !(cmd in COMMANDS)) {
    return res.status(400).json({ ok: false, error: "Invalid or missing command key" });
  }
  
  if (typeof cwd !== "string" || !cwd) {
    return res.status(400).json({ ok: false, error: "Working directory must be specified" });
  }

  const shellCmd = COMMANDS[cmd];

  exec(shellCmd, { 
    windowsHide: true, 
    timeout: 10000, 
    maxBuffer: 10 * 1024 * 1024,
    cwd: req.body.cwd || process.cwd()
  }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: `Command failed: ${err.message}`,
        stderr: stderr || undefined,
      });
    }

    return res.status(200).json({
      ok: true,
      stdout: stdout ? stdout.trim() : "",
      stderr: stderr ? stderr.trim() : "",
    });
  });
}