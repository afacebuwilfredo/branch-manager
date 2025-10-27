// pages/index.tsx
import { useState, useEffect, useCallback } from "react";
import { initialSites, Site } from "../lib/sites";
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
  const [assignedFilter, setAssignedFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const ITEMS_PER_PAGE = 8;

  // Get unique assigned users for filter suggestions
  const uniqueAssigned = Array.from(new Set(sites.map(s => s.assigned || "").filter(Boolean))).sort();

  // Function to get filtered suggestions based on current input
  const getAssignedSuggestions = (input: string) => {
    const inputLower = input.toLowerCase();
    return uniqueAssigned.filter(user => 
      user.toLowerCase().includes(inputLower)
    );
  };

  // Track which sites have had their branches loaded
  const [loadedBranches, setLoadedBranches] = useState<Set<string>>(new Set());

  const filteredSites = sites
    .filter(site => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        site.name.toLowerCase().includes(q) || 
        site.url.toLowerCase().includes(q) || 
        site.folderPath.toLowerCase().includes(q) || 
        site.server.toLowerCase().includes(q);
      const matchesServer = serverFilter === 'all' || site.server === serverFilter;
      const matchesAssigned = !assignedFilter || 
        (site.assigned || '').toLowerCase().includes(assignedFilter.toLowerCase());
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

  // Function to load branches for a single site
  const loadBranchesForSite = useCallback(async (site: Site) => {
    if (loadedBranches.has(site.id)) return; // Skip if already loaded

    try {
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'branches', cwd: site.folderPath }),
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        const branches = (data.stdout || '')
          .split(/\r?\n/)
          .map((b: string) => b.trim())
          .filter(Boolean);
        const currentBranch: string | undefined = data.currentBranch;
        
        setSites(prev => prev.map(p => {
          if (p.id !== site.id) return p;
          const active = currentBranch && branches.includes(currentBranch)
            ? currentBranch
            : (p.activeBranch && branches.includes(p.activeBranch) ? p.activeBranch : branches[0] || '');
          return { ...p, branches, activeBranch: active };
        }));
        
        setLoadedBranches(prev => new Set([...prev, site.id]));
      }
    } catch (err) {
      console.error(`Failed to load branches for ${site.name}:`, err);
    }
  }, [loadedBranches]);

  // Load branches for visible sites only
  useEffect(() => {
    paginatedSites.forEach(site => {
      if (!loadedBranches.has(site.id)) {
       loadBranchesForSite(site);
      }
    });
  }, [paginatedSites, loadedBranches, loadBranchesForSite]);

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
        const resp = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'clonebare', cwd: site.folderPath, target }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Failed to clone bare repository');
        }
        setSites(prev => prev.map(s => s.id === siteId ? { ...s, commandOutput: data.stdout || `Cloned bare repo ${target}` } : s));
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
        <div className="controls" style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          padding: '12px',
          background: '#f8f9fa',
          borderRadius: '8px',
          margin: '12px 0'
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em', color: '#666' }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Search website or url..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          
          {/* Assigned User Filter */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em', color: '#666' }}>
              Assigned User
            </label>
            <input
              type="text"
              placeholder="Search user..."
              value={assignedFilter}
              onChange={e => {
                setAssignedFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ 
                padding: '8px',
                paddingRight: assignedFilter ? '30px' : '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
            {assignedFilter && (
              <button
                onClick={() => setAssignedFilter('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  bottom: '8px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '4px'
                }}
              >
                ×
              </button>
            )}
            {assignedFilter && getAssignedSuggestions(assignedFilter).length > 0 && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                {getAssignedSuggestions(assignedFilter).map(suggestion => (
                  <div
                    key={suggestion}
                    onClick={() => setAssignedFilter(suggestion)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      fontSize: '14px'
                    }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Branch Filter */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em', color: '#666' }}>
              Branch
            </label>
            <input
              type="text"
              placeholder="Filter by branch..."
              value={branchFilter}
              onChange={e => {
                setBranchFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Server Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em', color: '#666' }}>
              Server
            </label>
            <select 
              value={serverFilter}
              onChange={e => setServerFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="all">All servers</option>
              <option value="ftp">FTP</option>
              <option value="sftp">SFTP</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em', color: '#666' }}>
              Sort By
            </label>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
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
                    <div className="small" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Server: <strong>{site.server}</strong> • Path: <code>{site.folderPath}</code>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            const resp = await fetch('/api/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ cmd: 'explorer', args: ['.'], cwd: site.folderPath }),
                            });
                            if (!resp.ok) throw new Error('Failed to open explorer');
                          } catch (err) {
                            console.error(err);
                            alert('Failed to open in File Explorer');
                          }
                        }}
                        style={{ padding: '2px 6px', fontSize: '12px' }}
                        title="Open in File Explorer"
                      >
                        OPEN IN FOLDER
                      </button>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            const resp = await fetch('/api/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ cmd: 'code', args: ['.'], cwd: site.folderPath }),
                            });
                            if (!resp.ok) throw new Error('Failed to open in VS Code');
                          } catch (err) {
                            console.error(err);
                            alert('Failed to open in VS Code');
                          }
                        }}
                        style={{ padding: '2px 6px', fontSize: '12px' }}
                        title="Open in VS Code"
                      >
                        OPEN IN VS CODE
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          // Extract repository name from folderPath
                          const repoName = site.name.replace(/\.cenix$/, '');
                          const githubUrl = `https://github.com/afafilo/${repoName}`;
                          window.open(githubUrl, '_blank');
                        }}
                        style={{ 
                          padding: '2px 6px', 
                          fontSize: '12px',
                          backgroundColor: '#24292e',
                          color: 'white'
                        }}
                        title="Open GitHub Repository"
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <svg height="16" viewBox="0 0 16 16" width="16" style={{ fill: 'currentColor' }}>
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                          </svg>
                          GitHub
                        </span>
                      </button>
                      <button
                        className="btn"
                        onClick={async () => {
                          setBusy(prev => ({ ...prev, [site.id]: true }));
                          try {
                            // get remotes
                            const resp = await fetch('/api/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ cmd: 'remotes', cwd: site.folderPath }),
                            });
                            const data = await resp.json();
                            if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to get remotes');

                            const out = (data.stdout || '') as string;
                            // parse first URL (https or git@ style)
                            const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                            let foundUrl = '';
                            for (const line of lines) {
                              const m = line.match(/(https?:\/\/[^\s]+|git@[^\s]+)/);
                              if (m) { foundUrl = m[1]; break; }
                            }
                            if (!foundUrl) throw new Error('No remote URL found');

                            // derive repo name
                            const repoName = (foundUrl.split('/').pop() || '').replace(/\.git$/, '');
                            const confirmMsg = `Clone ${foundUrl} into folder \"${repoName}\" under ${site.folderPath}?`;
                            if (!window.confirm(confirmMsg)) return;

                            const cloneResp = await fetch('/api/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ cmd: 'clone', cwd: site.folderPath, url: foundUrl, target: repoName }),
                            });
                            const cloneData = await cloneResp.json();
                            if (!cloneResp.ok || !cloneData.ok) {
                              throw new Error(cloneData.error || 'Clone failed');
                            }
                            setSites(prev => prev.map(s => s.id === site.id ? { ...s, commandOutput: cloneData.stdout || `Cloned ${repoName}` } : s));
                          } catch (err) {
                            console.error(err);
                            alert(err instanceof Error ? err.message : 'Clone failed');
                          } finally {
                            setBusy(prev => ({ ...prev, [site.id]: false }));
                          }
                        }}
                        disabled={busy[site.id]}
                        style={{ padding: '2px 6px', fontSize: '12px' }}
                        title="Clone repository from configured remote into this folder"
                      >
                        CLONE FROM REMOTE
                      </button>
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

