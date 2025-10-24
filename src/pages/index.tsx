// pages/index.tsx
import { useState, useEffect } from "react";
import { initialSites } from "../lib/sites";
import path from "path";

export default function Home() {
  const [sites, setSites] = useState(initialSites);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("name-asc");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [remoteFolderInputs, setRemoteFolderInputs] = useState<Record<string, string>>({});
  const [siteFolders, setSiteFolders] = useState<Record<string, string[]>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("");
  const ITEMS_PER_PAGE = 8;

  // Get unique assigned users and branches for filters
  const uniqueAssigned = Array.from(new Set(sites.map(s => s.assigned || "unassigned"))).sort();
  const uniqueBranches = Array.from(new Set(sites.flatMap(s => s.branches || []))).sort();

  const filteredSites = sites
    .filter(site => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        site.name.toLowerCase().includes(q) || 
        site.url.toLowerCase().includes(q) || 
        site.folderPath.toLowerCase().includes(q) || 
        site.server.toLowerCase().includes(q) || 
        (site.assigned || '').toLowerCase().includes(q);
      const matchesServer = serverFilter === 'all' || site.server === serverFilter;
      const matchesAssigned = assignedFilter === 'all' || 
        (assignedFilter === 'unassigned' && !site.assigned) ||
        site.assigned === assignedFilter;
      const matchesBranch = !branchFilter || 
        site.branches?.some(b => b.toLowerCase().includes(branchFilter.toLowerCase()));
      return matchesSearch && matchesServer && matchesAssigned && matchesBranch;
    })
    .sort((a, b) => 
      sortOrder === 'name-asc' 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name)
    );

  // Pagination logic
  const totalPages = Math.ceil(filteredSites.length / ITEMS_PER_PAGE);
  const paginatedSites = filteredSites.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function handleCommand(id: string, cmd: 'branches' | 'folders' | 'status' | 'forcepull' | 'remotes' | 'deletegit') {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const site = sites.find(s => s.id === id);
      if (!site) return;
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, cwd: site.folderPath }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Failed to ${cmd === 'branches' ? 'get branches' : 'list folders'}`);
      }

      // For branches, parse stdout into an array and update site.branches
      if (cmd === 'branches') {
        const branches = (data.stdout || '')
          .split(/\r?\n/)
          .map((b: string) => b.trim())
          .filter(Boolean);

        setSites(prev => prev.map(s => {
          if (s.id !== id) return s;
          // Always use the current git branch as the active branch when listing branches
          const currentBranch: string | undefined = data.currentBranch;
          // Set activeBranch to currentBranch if it exists in the branch list, otherwise keep existing or use first
          const active = currentBranch && branches.includes(currentBranch) 
            ? currentBranch 
            : (s.activeBranch && branches.includes(s.activeBranch) ? s.activeBranch : branches[0] || '');
          return { ...s, branches, activeBranch: active, commandOutput: data.stdout };
        }));
      } else {
        setSites(prev => prev.map(s => s.id === id ? { ...s, commandOutput: data.stdout } : s));
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }

  // Optionally pre-load branches for all sites on mount (non-blocking)
  useEffect(() => {
    sites.forEach(s => {
      // don't block UI; fire-and-forget
      (async () => {
        try {
          const resp = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: 'branches', cwd: s.folderPath }),
          });
          const data = await resp.json();
          if (resp.ok && data.ok) {
            const branches = (data.stdout || '')
              .split(/\r?\n/)
              .map((b: string) => b.trim())
              .filter(Boolean);
            const currentBranch: string | undefined = data.currentBranch;
            setSites(prev => prev.map(p => {
              if (p.id !== s.id) return p;
              // Set activeBranch to currentBranch if it exists in the branch list
              const active = currentBranch && branches.includes(currentBranch)
                ? currentBranch
                : (p.activeBranch && branches.includes(p.activeBranch) ? p.activeBranch : branches[0] || '');
              return { ...p, branches, activeBranch: active };
            }));
          }
        } catch {
          // ignore per-site errors during initial load
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(id: string, action: 'pull' | 'rebase') {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      if (action === 'pull') {
        const site = sites.find(s => s.id === id);
        if (!site) return;

        const resp = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            cmd: "list",
            cwd: site.folderPath
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Failed to pull branch');
        }
      } else if (action === 'rebase') {
        // Simulate rebase action
        await new Promise(r => setTimeout(r, 900));
        alert('Rebase simulated');
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handleCheckout(siteId: string, branch: string) {
    setBusy(prev => ({ ...prev, [siteId]: true }));
    try {
      const site = sites.find(s => s.id === siteId);
      if (!site) return;
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'checkout', cwd: site.folderPath, branch }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      // update activeBranch on success
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, activeBranch: branch, commandOutput: data.stdout || '' } : s));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred during checkout');
    } finally {
      setBusy(prev => ({ ...prev, [siteId]: false }));
    }
  }

  async function handleSetRemote(siteId: string) {
    setBusy(prev => ({ ...prev, [siteId]: true }));
    try {
      const site = sites.find(s => s.id === siteId);
      if (!site) return;
      
      // Check if folder exists that we want to rename
      const target = (remoteFolderInputs[siteId] || '').trim();
      if (!target) {
        throw new Error('Please enter a folder name to clone or rename');
      }

      // Check if the target folder exists by listing directories
      const listResp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'folders', cwd: site.folderPath }),
      });
      const listData = await listResp.json();
      if (!listResp.ok || !listData.ok) {
        throw new Error(listData.error || 'Failed to list folders');
      }

      const folders = (listData.stdout || '').split(/\r?\n/).map((f: string) => f.trim()).filter(Boolean);
      setSiteFolders(prev => ({ ...prev, [siteId]: folders }));
      if (folders.includes(target)) {
        // If target folder exists, rename it to .git
        const renameResp = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            cmd: 'renamegit', 
            cwd: path.join(site.folderPath, target)
          }),
        });
        const renameData = await renameResp.json();
        if (!renameResp.ok || !renameData.ok) {
          throw new Error(renameData.error || 'Failed to rename folder to .git');
        }
        setSites(prev => prev.map(s => s.id === siteId ? { ...s, commandOutput: renameData.stdout } : s));
      } else {
        // If folder doesn't exist, do a bare clone
        const url = `https://afafilo:${process.env.GITHUBTOKEN}@github.com/afafilo/${target}.git`;
        const resp = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'clonebare', cwd: site.folderPath, url, target }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Failed to clone bare repository');
        }
        setSites(prev => prev.map(s => s.id === siteId ? { ...s, commandOutput: data.stdout || `Cloned bare repo ${url} -> ${target}` } : s));
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setBusy(prev => ({ ...prev, [siteId]: false }));
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Website Branch Manager</h1>
        <div className="controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: '1' }}>
            <input
              type="text"
              placeholder="Search website or url"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ minWidth: '200px' }}
            />
            <select 
              value={serverFilter}
              onChange={e => setServerFilter(e.target.value)}
            >
              <option value="all">All servers</option>
              <option value="ftp">FTP</option>
              <option value="sftp">SFTP</option>
            </select>
            <select
              value={assignedFilter}
              onChange={e => {
                setAssignedFilter(e.target.value);
                setCurrentPage(1); // Reset to first page on filter change
              }}
            >
              <option value="all">All Users</option>
              <option value="unassigned">Unassigned</option>
              {uniqueAssigned.filter(a => a !== "unassigned").map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: '1' }}>
            <input
              type="text"
              placeholder="Filter by branch name"
              value={branchFilter}
              onChange={e => {
                setBranchFilter(e.target.value);
                setCurrentPage(1); // Reset to first page on filter change
              }}
              style={{ minWidth: '200px' }}
            />
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
            >
              <option value="name-asc">Name ↑</option>
              <option value="name-desc">Name ↓</option>
            </select>
          </div>
        </div>
      </header>

      <main>
        <ul className="sites">
          {paginatedSites.length === 0 ? (
            <li className="site muted">No websites match your search.</li>
          ) : (
            paginatedSites.map(site => (
              <li key={site.id} className="site">
                <div className="meta">
                  <div>
                    <a href={site.url} target="_blank" rel="noopener noreferrer">
                      {site.name}
                    </a>
                    <div className="small">{site.url}</div>
                    <div className="small">
                      Server: <strong>{site.server}</strong> • Path: <code>{site.folderPath}</code>
                    </div>
                  </div>
                  <div className="small">
                    Active<br/>
                    <strong>{site.activeBranch}</strong>
                    <div>{site.assigned || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                  {/* Branch Selection Group */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ minWidth: '60px' }}>Branch</label>
                    <select 
                      value={site.activeBranch}
                      onChange={e => {
                        const newBranch = e.target.value;
                        setSites(prev => prev.map(s => s.id === site.id ? { ...s, activeBranch: newBranch } : s));
                        handleCheckout(site.id, newBranch);
                      }}
                      style={{ minWidth: '160px' }}
                    >
                      {site.branches.map(branch => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Main Actions Group */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn"
                        onClick={() => handleAction(site.id, 'pull')}
                        disabled={busy[site.id]}
                      >
                        {busy[site.id] ? 'Pulling…' : 'Pull branch'}
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleCommand(site.id, 'forcepull')}
                        disabled={busy[site.id]}
                      >
                        Force Pull
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleAction(site.id, 'rebase')}
                        disabled={busy[site.id]}
                      >
                        {busy[site.id] ? 'Working…' : 'Rebase'}
                      </button>
                    </div>

                    {/* Info Commands Group */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn"
                        onClick={() => handleCommand(site.id, 'branches')}
                        disabled={busy[site.id]}
                      >
                        Show Branches
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleCommand(site.id, 'status')}
                        disabled={busy[site.id]}
                      >
                        Git Status
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleCommand(site.id, 'remotes')}
                        disabled={busy[site.id]}
                      >
                        Remotes
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleCommand(site.id, 'folders')}
                        disabled={busy[site.id]}
                      >
                        List Folders
                      </button>
                    </div>

                    {/* Remote URL Group */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                      <input
                        type="text"
                        placeholder={"Enter target folder name"}
                        value={remoteFolderInputs[site.id] || ''}
                        onChange={async e => {
                          setRemoteFolderInputs(prev => ({ ...prev, [site.id]: e.target.value }));
                          try {
                            const resp = await fetch('/api/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ cmd: 'folders', cwd: site.folderPath }),
                            });
                            const data = await resp.json();
                            if (resp.ok && data.ok) {
                              const folders = (data.stdout || '').split(/\r?\n/).map((f: string) => f.trim()).filter(Boolean);
                              setSiteFolders(prev => ({ ...prev, [site.id]: folders }));
                            }
                          } catch (err) {
                            console.error('Failed to fetch folders:', err);
                          }
                        }}
                        style={{ 
                          minWidth: '220px',
                          padding: '4px 8px',
                          border: '1px solid #ccc',
                          borderRadius: '4px'
                        }}
                      />
                      <button
                        className="btn"
                        onClick={() => handleSetRemote(site.id)}
                        disabled={busy[site.id]}
                      >
                        {busy[site.id] ? 'Working…' : (
                          siteFolders[site.id]?.includes(remoteFolderInputs[site.id]?.trim() || '') ? 'Rename to .git' : 'Clone Bare'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div style={{ 
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    paddingTop: '8px',
                    borderTop: '1px solid #eee',
                    marginTop: '4px'
                  }}>
                    <span style={{ color: '#666', fontSize: '0.9em' }}>Danger Zone:</span>
                    <button
                      className="btn"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to remove Git from this directory? This cannot be undone.')) {
                          handleCommand(site.id, 'deletegit')
                        }
                      }}
                      disabled={busy[site.id]}
                      style={{ 
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none'
                      }}
                    >
                      Delete Git
                    </button>
                  </div>
                </div>
                <div className="small muted">
                  Tip: use the dropdown to switch local selection, then Pull to fetch from remote.
                </div>
                {site.commandOutput && (
                  <pre className="command-output">
                    {site.commandOutput}
                  </pre>
                )}
              </li>
            ))
          )}
        </ul>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '8px',
            marginTop: '20px',
            padding: '10px'
          }}>
            <button
              className="btn"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ minWidth: '100px' }}
            >
              Previous
            </button>
            <span style={{ margin: '0 10px' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ minWidth: '100px' }}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

