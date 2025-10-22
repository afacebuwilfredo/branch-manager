// pages/api/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";

type Data = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  // when listing branches, include the currently checked out branch
  currentBranch?: string;
};

const COMMANDS: Record<string, string> = (() => {
  const isWin = process.platform === "win32";
  return {
    whoami: isWin ? "whoami" : "whoami",
    pwd: isWin ? "cd" : "pwd",
    list: isWin ? "dir" : "ls -la",
  // list branch names only, one per line (portable across git versions)
  branches: 'git branch --format="%(refname:short)"',
    folders: isWin ? "dir /AD /B" : "ls -d */",
  };
})();

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
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

  // small helper returning a promise for exec
  const execPromise = (command: string) => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(command, {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: cwd || process.cwd()
    }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout: stdout || '', stderr: stderr || '' });
      resolve({ stdout: stdout ? stdout : '', stderr: stderr ? stderr : '' });
    });
  });

  try {
    // Special handling for branches: return branch list PLUS the repository's default branch
    if (cmd === 'branches') {
      const branchesResult = await execPromise(shellCmd);
      const branchesStdout = branchesResult.stdout ? branchesResult.stdout.trim() : '';

      // Get the current branch name
      let currentBranch: string | undefined = undefined;
      try {
        const branchResult = await execPromise('git rev-parse --abbrev-ref HEAD');
        currentBranch = (branchResult.stdout || '').trim();
      } catch {
        // if we can't get the current branch, leave it undefined
      }

      return res.status(200).json({ ok: true, stdout: branchesStdout, currentBranch });
    }

    // default handling for other commands
    const result = await execPromise(shellCmd);
    return res.status(200).json({ ok: true, stdout: result.stdout ? result.stdout.trim() : '', stderr: result.stderr ? result.stderr.trim() : '' });
  } catch (errUnknown) {
    // errUnknown may be the reject object from execPromise; narrow safely
    let message = 'Command failed';
    let stderr: string | undefined = undefined;
    if (typeof errUnknown === 'object' && errUnknown !== null) {
      // possible shape returned from execPromise rejection
      const e = errUnknown as { err?: { message?: string }; message?: string; stderr?: string };
      if (e.err && typeof e.err.message === 'string') message = e.err.message;
      else if (typeof e.message === 'string') message = e.message;
      if (e.stderr) stderr = String(e.stderr).trim();
    } else if (typeof errUnknown === 'string') {
      message = errUnknown;
    }
    return res.status(500).json({ ok: false, error: `Command failed: ${message}`, stderr });
  }
}