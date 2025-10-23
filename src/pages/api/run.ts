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
    // show both local and remote branches, removing 'origin/' prefix for cleaner display
    branches: 'git branch -a --format=%(refname:short)',
    // git commands handled by custom logic in handler
    checkout: 'git checkout',
    forcepull: 'git fetch origin && git reset --hard',  // actual branch handling in handler
    // show status with branch info and short format
    status: 'git status -sb',
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

  // helper: run a shell command and always resolve with outputs
  const execPromise = (command: string) => new Promise<{ stdout: string; stderr: string; error?: string }>(resolve => {
    exec(command, {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: cwd || process.cwd(),
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    }, (err, stdout, stderr) => {
      resolve({ stdout: stdout ? String(stdout) : '', stderr: stderr ? String(stderr) : '', error: err ? String(err.message) : undefined });
    });
  });

  try {
    if (cmd === 'branches') {
      // check if folder is a git repo; if not, return a sentinel 'no git'
      const gitCheck = await execPromise('git rev-parse --git-dir');
      if (gitCheck.error || gitCheck.stderr || !gitCheck.stdout) {
        return res.status(200).json({ ok: true, stdout: 'no git', currentBranch: undefined });
      }

      // get current branch
      const branchResult = await execPromise('git rev-parse --abbrev-ref HEAD');
      const currentBranch = branchResult.stdout ? branchResult.stdout.trim() : undefined;

      // fetch from origin to ensure we have latest remote branches
      await execPromise('git fetch origin');

      // get all branches (local and remote)
      const branchesResult = await execPromise(shellCmd);
      let branches = (branchesResult.stdout || '').split('\n')
        .map(b => b.trim())
        .filter(b => b && !b.startsWith('HEAD ->'))  // filter out HEAD pointer
        .map(b => b.replace(/^remotes\/origin\//, ''))  // remove remote prefix
        .filter((b, i, arr) => arr.indexOf(b) === i);  // remove duplicates

      // if we have no branches but have current branch, use that
      if ((!branches.length || branchesResult.error) && currentBranch) {
        branches = [currentBranch];
      }

      return res.status(200).json({ 
        ok: true, 
        stdout: branches.join('\n'),
        currentBranch 
      });
    }

    if (cmd === 'forcepull') {
      // get current branch if not specified
      const branch = req.body.branch ? String(req.body.branch).replace(/^origin\//, '') : '';
      if (!branch) {
        const current = await execPromise('git rev-parse --abbrev-ref HEAD');
        if (current.error || !current.stdout) {
          return res.status(500).json({ ok: false, error: 'Could not determine current branch' });
        }
        const currentBranch = current.stdout.trim();
        // fetch and hard reset to origin's version
        const reset = await execPromise(`git fetch origin && git reset --hard origin/${currentBranch}`);
        if (reset.error) {
          return res.status(500).json({ ok: false, error: `Force pull failed: ${reset.error}`, stderr: reset.stderr });
        }
        return res.status(200).json({ ok: true, stdout: reset.stdout || `Force pulled ${currentBranch} from origin` });
      }
      // fetch and hard reset to specified branch
      const reset = await execPromise(`git fetch origin && git reset --hard origin/${branch}`);
      if (reset.error) {
        return res.status(500).json({ ok: false, error: `Force pull failed: ${reset.error}`, stderr: reset.stderr });
      }
      return res.status(200).json({ ok: true, stdout: reset.stdout || `Force pulled ${branch} from origin` });
    }

    if (cmd === 'checkout') {
      // branch name supplied in body - remove any origin/ prefix
      const branch = ((req.body && req.body.branch) ? String(req.body.branch) : '').replace(/^origin\//, '');
      if (!branch) return res.status(400).json({ ok: false, error: 'Missing branch name' });

      // ensure git repo
      const gitCheck2 = await execPromise('git rev-parse --git-dir');
      if (gitCheck2.error || gitCheck2.stderr || !gitCheck2.stdout) {
        return res.status(200).json({ ok: true, stdout: 'no git' });
      }

      // fetch latest from origin
      await execPromise('git fetch origin');
      
      // clean branch name for git commands (no origin/ prefix)
      const cleanBranch = branch.replace(/^origin\//, '');
      
      // check if branch exists locally
      const verifyLocal = await execPromise(`git rev-parse --verify refs/heads/${cleanBranch}`);
      if (!verifyLocal.error && !verifyLocal.stderr && verifyLocal.stdout) {
        // local branch exists, checkout and pull latest
        const co = await execPromise(`git checkout ${cleanBranch} && git pull origin ${cleanBranch}`);
        if (co.error) return res.status(500).json({ ok: false, error: `Checkout failed: ${co.error}`, stderr: co.stderr });
        return res.status(200).json({ ok: true, stdout: co.stdout || 'Checked out and updated local branch' });
      }

      // check if branch exists on origin
      const remoteCheck = await execPromise(`git ls-remote --heads origin ${cleanBranch}`);
      if (remoteCheck.stdout && remoteCheck.stdout.trim()) {
        // create a local branch tracking origin/branch then checkout
        const co2 = await execPromise(`git checkout -b ${cleanBranch} origin/${cleanBranch}`);
        if (co2.error) {
          // if branch exists but checkout -b failed, try direct checkout
          const co3 = await execPromise(`git checkout ${cleanBranch}`);
          if (co3.error) {
            return res.status(500).json({ ok: false, error: `Checkout remote failed: ${co2.error}\n${co3.error}`, stderr: `${co2.stderr}\n${co3.stderr}` });
          }
        }
        return res.status(200).json({ ok: true, stdout: 'Checked out from origin' });
      }

      return res.status(400).json({ ok: false, error: `Branch not found: ${branch}` });
    }

    // default handler for other commands
    const result = await execPromise(shellCmd);
    if (result.error) {
      return res.status(500).json({ ok: false, error: `Command failed: ${result.error}`, stderr: result.stderr || undefined });
    }

    return res.status(200).json({ ok: true, stdout: result.stdout ? result.stdout.trim() : '', stderr: result.stderr ? result.stderr.trim() : '' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}