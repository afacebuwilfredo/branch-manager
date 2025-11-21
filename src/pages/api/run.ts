// pages/api/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import fs from 'fs';
import path from 'path';

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
    // Open in File Explorer (Windows) or default file manager (Unix)
    explorer: isWin ? "explorer" : "xdg-open",
    // Open in VS Code
    code: "code",
    // show both local and remote branches, removing 'origin/' prefix for cleaner display
    branches: 'git branch -a --format=%(refname:short)',
    // git commands handled by custom logic in handler
    checkout: 'git checkout',
    forcepull: 'git fetch origin && git reset --hard',  // actual branch handling in handler
    // show status with branch info and short format
    status: 'git status -sb',
    // show configured remotes
    remotes: 'git remote -v',
    // set remote URL
    setremote: 'git remote set-url origin',  // URL will be appended in handler
    // clone a bare repository
  clonebare: 'git clone --bare',
  // generic clone (frontend provides the URL and target)
  clone: 'git clone',
    // remove git tracking (using attrib on Windows to handle readonly files)
    deletegit: process.platform === "win32" ? "attrib -r -h .git\\* /s && rmdir /s /q .git" : "rm -rf .git",
    // rename folder to .git (handled in custom logic)
    renamegit: '',
    folders: isWin ? "dir /AD /B" : "ls -d */",
  };
})();

// Note: we intentionally don't include a 'setremote' template in COMMANDS because
// the handler will validate and run it explicitly to avoid accidental execution.

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

  // Helper to ensure the directory is marked as safe for Git
  const ensureSafeDirectory = async (directory: string) => {
    try {
      // First check if the directory is already configured as safe
      const checkResult = await execPromise('git config --global --get-all safe.directory');
      const safeDirectories = checkResult.stdout.split('\n').map(d => d.trim());
      
      if (!safeDirectories.includes(directory)) {
        // Add the directory to safe.directory
        await execPromise(`git config --global --add safe.directory "${directory}"`);
      }
    } catch (err) {
      console.warn('Failed to configure safe.directory:', err);
      // Continue anyway as the operation might still work
    }
  };

  try {
    if (cmd === 'branches') {
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

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
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

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
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

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

    if (cmd === 'setremote') {
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

      // Expect a `url` in body
      const url = req.body && typeof req.body.url === 'string' ? String(req.body.url).trim() : '';
      if (!url) return res.status(400).json({ ok: false, error: 'Missing remote URL' });

      // Basic validation: must look like an http(s) URL or git@ style URL
      const isHttp = /^https?:\/\/.+/.test(url);
      const isGitAt = /^git@.+:.+/.test(url);
      if (!isHttp && !isGitAt) {
        return res.status(400).json({ ok: false, error: 'Invalid remote URL format' });
      }

      // Check if it's a git repo
      const gitCheck = await execPromise('git rev-parse --git-dir');
      if (gitCheck.error || gitCheck.stderr) {
        // Not a git repo, initialize one
        const initResult = await execPromise('git init');
        if (initResult.error) {
          return res.status(500).json({ ok: false, error: `Failed to initialize git repository: ${initResult.error}`, stderr: initResult.stderr });
        }
      }

      // Add remote origin if it doesn't exist, otherwise set-url
      const remoteCheck = await execPromise('git remote');
      if (!remoteCheck.stdout.includes('origin')) {
        const addResult = await execPromise(`git remote add origin "${url.replace(/"/g, '\\"')}"`);
        if (addResult.error) {
          return res.status(500).json({ ok: false, error: `Failed to add remote: ${addResult.error}`, stderr: addResult.stderr });
        }
      } else {
        // run git remote set-url origin <url>
        const setResult = await execPromise(`git remote set-url origin "${url.replace(/"/g, '\\"')}"`);
        if (setResult.error) {
          return res.status(500).json({ ok: false, error: `Failed to set remote: ${setResult.error}`, stderr: setResult.stderr });
        }
      }

      return res.status(200).json({ ok: true, stdout: `Git repository initialized and remote set to ${url}` });
    }

      if (cmd === 'clonebare') {
        // Ensure the directory is marked as safe for Git
        await ensureSafeDirectory(cwd);

        // Expect target in body
        const target = req.body && typeof req.body.target === 'string' ? String(req.body.target).trim() : '';
        if (!target) return res.status(400).json({ ok: false, error: 'Missing target folder name' });
        
        // Get token from environment
        const token = process.env.GITHUB_TOKEN || process.env.GITHUBTOKEN;
        if (!token) {
          return res.status(500).json({ ok: false, error: 'GitHub token not configured. Please set GITHUB_TOKEN in environment variables.' });
        }
        
        // Construct URL with token
        const url = `https://afafilo:${token}@github.com/afafilo/${target}.git`;

        // Basic validation for URL
        const isHttp = /^https?:\/\/.+/.test(url);
        const isGitAt = /^git@.+:.+/.test(url);
        if (!isHttp && !isGitAt) {
          return res.status(400).json({ ok: false, error: 'Invalid clone URL format' });
        }

        const pfs = fs.promises as typeof fs.promises;
        const targetPath = path.resolve(cwd, target);

        // refuse if target exists
        const exists = await pfs.stat(targetPath).then(() => true).catch(() => false);
        if (exists) {
          return res.status(400).json({ ok: false, error: `Target already exists: ${targetPath}` });
        }

        // run git clone --bare <url> <targetPath>
        const safeUrl = url.replace(/"/g, '\\"');
        const safeTarget = targetPath.replace(/"/g, '\\"');
        const cmdLine = `git clone --bare "${safeUrl}" "${safeTarget}"`;
        const r = await execPromise(cmdLine);
        if (r.error) {
          return res.status(500).json({ ok: false, error: `Clone failed: ${r.error}`, stderr: r.stderr });
        }

        // After cloning, apply changes to make it work as a regular repo
        try {
          // Run these commands in the target directory
          const applyCommands = [
            'git config --bool core.bare false',
            'git config --path core.worktree ../',
            'git reset --hard HEAD'
          ];
          
          for (const cmd of applyCommands) {
            const result = await execPromise(cmd);
            if (result.error) {
              return res.status(500).json({ 
                ok: false, 
                error: `Failed to apply changes: ${result.error}`,
                stderr: result.stderr 
              });
            }
          }
          return res.status(200).json({ 
            ok: true, 
            stdout: r.stdout + '\nApplied changes to work as regular repository' 
          });
        } catch (err) {
          return res.status(500).json({ 
            ok: false, 
            error: `Failed while applying changes: ${err}` 
          });
        }
      }

    // Special handling for deletegit to ensure all git files are removable
    if (cmd === 'deletegit') {
      // Try to remove directories using Node fs first for more reliable behavior
      const gitDir = path.join(cwd, '.git');
      const githubDir = path.join(cwd, '.github');

      const tryFsRemove = async () => {
        try {
          // On Windows, clear read-only and hidden attributes first
          if (process.platform === 'win32') {
            try {
              await execPromise(`attrib -r -h "${gitDir}\\*" /s`);
            } catch {
              // ignore
            }
            try {
              await execPromise(`attrib -r -h "${githubDir}\\*" /s`);
            } catch {
              // ignore
            }
          }

          const rmOptions: fs.RmOptions = { recursive: true, force: true };
          // Use fs.rm if available (Node 14.14+/16+). Use promises API.
          const pfs = fs.promises as typeof fs.promises;
          // Remove both directories (ignore if doesn't exist)
          await pfs.rm(gitDir, rmOptions).catch(() => {});
          await pfs.rm(githubDir, rmOptions).catch(() => {});

          // verify removal
          const gitExists = await pfs.stat(gitDir).then(() => true).catch(() => false);
          const githubExists = await pfs.stat(githubDir).then(() => true).catch(() => false);
          if (!gitExists && !githubExists) {
            return { ok: true, stdout: 'Git repository and GitHub folder successfully removed' };
          }
          return { ok: false, error: 'fs removal incomplete' };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      };

      const fsResult = await tryFsRemove();
      if (fsResult.ok) {
        return res.status(200).json({ ok: true, stdout: fsResult.stdout });
      }

      // Fall back to shell methods if fs removal failed
      try {
        if (process.platform === 'win32') {
          // attempt Windows specific deletion for .git and .github
          const cmdLine = `del /f /s /q "${gitDir}" && rmdir /s /q "${gitDir}" && if exist "${githubDir}" (del /f /s /q "${githubDir}" & rmdir /s /q "${githubDir}")`;
          const r = await execPromise(cmdLine);
          if (r.error) throw new Error(r.error);
        } else {
          const cmdLine = `chmod -R 777 "${gitDir}" || true; rm -rf "${gitDir}"; rm -rf "${githubDir}"`;
          const r = await execPromise(cmdLine);
          if (r.error) throw new Error(r.error);
        }

        return res.status(200).json({ ok: true, stdout: 'Git repository and GitHub folder successfully removed (fallback)' });
      } catch (err) {
        return res.status(500).json({ ok: false, error: `Failed to remove Git repository and GitHub folder: ${err}` });
      }
    }

    if (cmd === 'clone') {
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

      const url = req.body && typeof req.body.url === 'string' ? String(req.body.url).trim() : '';
      const target = req.body && typeof req.body.target === 'string' ? String(req.body.target).trim() : '';
      if (!url) return res.status(400).json({ ok: false, error: 'Missing clone URL' });
      if (!target) return res.status(400).json({ ok: false, error: 'Missing target folder name' });

      // Basic validation: must look like an http(s) URL or git@ style URL
      const isHttp = /^https?:\/\/.+/.test(url);
      const isGitAt = /^git@.+:.+/.test(url);
      if (!isHttp && !isGitAt) {
        return res.status(400).json({ ok: false, error: 'Invalid clone URL format' });
      }

      const pfs = fs.promises as typeof fs.promises;
      const targetPath = path.resolve(cwd, target);

      // refuse if target exists
      const exists = await pfs.stat(targetPath).then(() => true).catch(() => false);
      if (exists) {
        return res.status(400).json({ ok: false, error: `Target already exists: ${targetPath}` });
      }

      // run git clone <url> <targetPath>
      const safeUrl = url.replace(/"/g, '\\"');
      const safeTarget = targetPath.replace(/"/g, '\\"');
      const cmdLine = `git clone "${safeUrl}" "${safeTarget}"`;
      const r = await execPromise(cmdLine);
      if (r.error) {
        return res.status(500).json({ ok: false, error: `Clone failed: ${r.error}`, stderr: r.stderr });
      }

      return res.status(200).json({ ok: true, stdout: r.stdout || `Cloned ${url} to ${targetPath}` });
    }

    if (cmd === 'renamegit') {
      try {
        // Get the current directory name
        const dirName = path.basename(cwd);
        const parentDir = path.dirname(cwd);
        const targetPath = path.join(parentDir, '.git');

        // Check if .git already exists in parent directory
        const gitExists = await fs.promises.stat(targetPath).then(() => true).catch(() => false);
        if (gitExists) {
          return res.status(400).json({ 
            ok: false, 
            error: '.git folder already exists in parent directory' 
          });
        }

        // On Windows, try to clear read-only and hidden attributes first
        if (process.platform === 'win32') {
          try {
            // Clear attributes on the source directory and all contents
            await execPromise(`attrib -r -h "${cwd}\\*" /s`);
            await execPromise(`attrib -r -h "${cwd}"`);
          } catch (attribErr) {
            console.warn('Failed to clear attributes:', attribErr);
            // Continue anyway as the rename might still work
          }
        } else {
          // On Unix systems, ensure write permissions
          try {
            await execPromise(`chmod -R u+w "${cwd}"`);
          } catch (chmodErr) {
            console.warn('Failed to set permissions:', chmodErr);
            // Continue anyway as the rename might still work
          }
        }

        // Attempt the rename
        try {
          await fs.promises.rename(cwd, targetPath);
        } catch (err) {
          // If the rename fails, log and try a fallback copy-and-delete approach
          console.warn('rename failed, attempting fallback:', err);
          if (process.platform === 'win32') {
            // Windows fallback using robocopy (preserves attributes)
            await execPromise(`robocopy "${cwd}" "${targetPath}" /E /MOVE`);
          } else {
            // Unix fallback using cp and rm
            await execPromise(`cp -a "${cwd}/." "${targetPath}/" && rm -rf "${cwd}"`);
          }
        }

        // Verify the rename worked
        const targetExists = await fs.promises.stat(targetPath).then(() => true).catch(() => false);
        const sourceExists = await fs.promises.stat(cwd).then(() => true).catch(() => false);
        
        if (!targetExists || sourceExists) {
          throw new Error('Rename operation could not be verified');
        }

        return res.status(200).json({
          ok: true,
          stdout: `Successfully renamed ${dirName} to .git`
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: `Failed to rename directory: ${err}`
        });
      }
    }

    // For git status, check if we have a valid git working tree first
    if (cmd === 'status') {
      // Ensure the directory is marked as safe for Git
      await ensureSafeDirectory(cwd);

      // Check if we have a valid git repository with a working tree
      const gitDirCheck = await execPromise('git rev-parse --git-dir');
      const workTreeCheck = await execPromise('git rev-parse --show-toplevel');
      
      if (gitDirCheck.error || workTreeCheck.error) {
        return res.status(200).json({ 
          ok: true, 
          stdout: 'Not a git repository or no working tree' 
        });
      }
    }

    // default handler for other commands
    const args = (req.body.args || []) as string[];
    const fullCmd = `${shellCmd} ${args.map((arg: string) => `"${arg}"`).join(' ')}`.trim();
    const result = await execPromise(fullCmd);
    if (result.error) {
      return res.status(500).json({ ok: false, error: `Command failed: ${result.error}`, stderr: result.stderr || undefined });
    }

    return res.status(200).json({ ok: true, stdout: result.stdout ? result.stdout.trim() : '', stderr: result.stderr ? result.stderr.trim() : '' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}