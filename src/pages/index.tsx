// pages/index.tsx
import { useState, useEffect } from "react";

interface Site {
  id: string;
  name: string;
  url: string;
  assigned: string;
  activeBranch: string;
  branches: string[];
  server: string;
  folderPath: string;
  commandOutput?: string;
}

const initialSites: Site[] = [
  { 
    id: '1', 
    name: 'colombianlady', 
    url: 'http://colombianlady.cenix', 
    assigned: 'afacebu.wilfredo@gmail.com', 
    activeBranch: 'develop', 
    branches: ["loading"], 
    server: 'sftp', 
    folderPath: 'R:/WebServer2/colombianlady.com' 
  },
  { 
    id: '2', 
    name: 'barranquilladating', 
    url: 'http://barranquilladating.cenix', 
    assigned: 'afacebu.randy@gmail.com', 
    activeBranch: 'main', 
    branches: ['loading'], 
    server: 'ftp', 
    folderPath: 'R:/WebServer2/barranquilladating.com' 
  },
  { 
    id: '3', 
    name: 'poltavawomen', 
    url: 'http://poltavawomen.cenix', 
    assigned: 'afacebu.jestoni@gmail.com', 
    activeBranch: 'feature/tiktok-scheduler', 
    branches: ['loading'], 
    server: 'ftp', 
    folderPath: 'R:/WebServer2/poltavawomen.com' 
  }
];

export default function Home() {
  const [sites, setSites] = useState(initialSites);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("name-asc");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

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
      return matchesSearch && matchesServer;
    })
    .sort((a, b) => 
      sortOrder === 'name-asc' 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name)
    );

  async function handleCommand(id: string, cmd: 'branches' | 'folders') {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const site = sites.find(s => s.id === id);
      if (!site) return;

      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          cmd,
          cwd: site.folderPath
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Failed to ${cmd === 'branches' ? 'get branches' : 'list folders'}`);
      }
      
      setSites(prev => prev.map(s => 
        s.id === id 
          ? { ...s, commandOutput: data.stdout }
          : s
      ));
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

  return (
    <div className="container">
      <header>
        <h1>Website Branch Manager</h1>
        <div className="controls">
          <input
            type="text"
            placeholder="Search website or url"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
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
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
          >
            <option value="name-asc">Name ↑</option>
            <option value="name-desc">Name ↓</option>
          </select>
        </div>
      </header>

      <main>
        <ul className="sites">
          {filteredSites.length === 0 ? (
            <li className="site muted">No websites match your search.</li>
          ) : (
            filteredSites.map(site => (
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
                <div className="row">
                  <label>Branch</label>
                  <select 
                    value={site.activeBranch}
                    onChange={e => {
                      setSites(prev => 
                        prev.map(s => 
                          s.id === site.id 
                            ? { ...s, activeBranch: e.target.value }
                            : s
                        )
                      );
                    }}
                  >
                    {site.branches.map(branch => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    onClick={() => handleAction(site.id, 'pull')}
                    disabled={busy[site.id]}
                  >
                    {busy[site.id] ? 'Pulling…' : 'Pull branch'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleAction(site.id, 'rebase')}
                    disabled={busy[site.id]}
                  >
                    {busy[site.id] ? 'Working…' : 'Rebase'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'branches')}
                    disabled={busy[site.id]}
                  >
                    Show Branches
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'folders')}
                    disabled={busy[site.id]}
                  >
                    List Folders
                  </button>
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
      </main>
    </div>
  );
}

