import React, { useEffect, useState } from "react";
import Image from 'next/image';
import type {
  GitHubGraphQLResponse,
  GitHubRepository,
  GitHubCommit
} from '../types/github';

interface ViewerRepositoriesData {
  viewer: {
    repositories: {
      nodes: GitHubRepository[];
    };
    organizations: {
      nodes: Array<{
        repositories: {
          nodes: GitHubRepository[];
        };
      }>;
    };
  };
}

interface CommitHistoryData {
  repository: {
    defaultBranchRef: {
      target: {
        history: {
          nodes: GitHubCommit[];
        };
      };
    };
  };
}

interface SearchCountsData {
  [key: string]: {
    issueCount: number;
  };
}

/**
 * Usage:
 * - Add a route for "/contribution-report" to render this component.
 * - Make sure your backend (server.js in this example) is running and available
 *   under the same origin or that CORS is configured.
 *
 * Backend endpoints used:
 * - GET  /api/auth/me                -> returns { login, avatarUrl } or 401
 * - GET  /api/auth/github/login      -> redirect to GitHub OAuth (user clicks)
 * - POST /api/github/graphql         -> proxied GitHub GraphQL request (server uses stored token)
 *
 * NOTE: This component does client-side aggregation of repository members' contributions
 *       from GraphQL responses proxied by /api/github/graphql. For large orgs/repos,
 *       move aggregation to the server to avoid rate limits and long client waits.
 */

type MemberContribution = {
  login: string;
  avatarUrl?: string;
  url?: string;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  additions?: number;
  deletions?: number;
};

type RepoSummary = {
  id: string;
  nameWithOwner: string; // e.g. owner/repo
  name: string;
  owner: string;
  defaultBranch?: string;
  members: MemberContribution[];
};

export default function ContributionReportPage(): React.ReactElement {
  const [me, setMe] = useState<{ login: string; avatarUrl?: string } | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxCommitsToScan] = useState<number>(200); // adjustable safety cap

  useEffect(() => {
    async function fetchMe() {
      setLoadingMe(true);
      try {
        const r = await fetch("/api/auth/me");
        if (r.status === 401) {
          setMe(null);
        } else {
          const json = await r.json();
          setMe(json);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to detect auth status.");
      } finally {
        setLoadingMe(false);
      }
    }
    fetchMe();
  }, []);

  async function handleLogin() {
    // Redirect to backend GitHub login route
    window.location.href = "/api/auth/github/login";
  }

  async function handleLogout() {
    // For simplicity: call backend to clear cookie/session. If you don't have such route, clear client state.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore error
    }
    setMe(null);
    setRepos(null);
  }

  async function fetchUserReposAndContributions() {
    setLoadingRepos(true);
    setError(null);
    try {
      // 1) Get user's repositories (owned + member-of). We'll use GraphQL viewer field to get owned repos
      // and viewer's organizations and their repos (first page). For full coverage implement pagination.
      const repoListQuery = `
      query ViewerRepos($repoPageSize:Int!) {
        viewer {
          login
          repositories(first: $repoPageSize, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
            totalCount
            nodes {
              id
              name
              nameWithOwner
              owner { login }
              defaultBranchRef { name }
            }
          }
          organizations(first: 50) {
            nodes {
              login
              repositories(first: 20) {
                nodes {
                  id
                  name
                  nameWithOwner
                  owner { login }
                  defaultBranchRef { name }
                }
              }
            }
          }
        }
      }`;

      const repoListResp = await proxyGraphQL<ViewerRepositoriesData>(repoListQuery, { repoPageSize: 50 });

      const repoNodes: GitHubRepository[] = [];

      const viewerRepos = repoListResp.viewer?.repositories?.nodes ?? [];
      repoNodes.push(...viewerRepos);

      const orgs = repoListResp.viewer?.organizations?.nodes ?? [];
      for (const org of orgs) {
        const orgRepos = org?.repositories?.nodes ?? [];
        // add repos that we don't already have
        for (const r of orgRepos) {
          if (!repoNodes.find((x) => x.nameWithOwner === r.nameWithOwner)) repoNodes.push(r);
        }
      }

      // Map to RepoSummary basic shape
      const repoSummaries: RepoSummary[] = repoNodes.map((r) => ({
        id: r.id,
        nameWithOwner: r.nameWithOwner,
        name: r.name,
        owner: r.owner?.login ?? "",
        defaultBranch: r.defaultBranchRef?.name ?? undefined,
        members: [],
      }));

      // For each repo, fetch recent commits on default branch (capped) and then gather authors,
      // then query PR & issue counts per author. We'll do this per-repo sequentially to be kinder to rate limits.
      const results: RepoSummary[] = [];
      for (const repo of repoSummaries) {
        try {
          const repoContribs = await buildRepoContributions(repo, maxCommitsToScan);
          results.push(repoContribs);
        } catch (err) {
          console.warn("Failed to fetch contributions for", repo.nameWithOwner, err);
          // still include an empty repo with error note in members list (optional)
          results.push({ ...repo, members: [] });
        }
      }

      setRepos(results);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to fetch repositories");
    } finally {
      setLoadingRepos(false);
    }
  }

  // helper: call backend GraphQL proxy
  async function proxyGraphQL<T>(query: string, variables = {}): Promise<T> {
    const res = await fetch("/api/github/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GraphQL proxy failed: ${res.status} ${t}`);
    }
    const body: GitHubGraphQLResponse<T> = await res.json();
    if (body.errors) {
      console.error("GraphQL errors:", body.errors);
      throw new Error(body.errors.map(e => e.message).join("; "));
    }
    return body.data!;
  }

  // For a repo, do a small aggregation: recent commits -> authors -> PR/Issue counts
  async function buildRepoContributions(repo: RepoSummary, commitCap: number): Promise<RepoSummary> {
    // 1) fetch commits on default branch (first N)
    const branch = repo.defaultBranch ?? "main";
    // GraphQL query: repository(defaultBranchRef.target.history)
    const commitQuery = `
    query RepoCommits($owner:String!, $name:String!, $max:Int!, $branch:String!) {
      repository(owner:$owner, name:$name) {
        defaultBranchRef {
          name
          target {
            ... on Commit {
              history(first: $max) {
                totalCount
                nodes {
                  oid
                  committedDate
                  additions
                  deletions
                  author {
                    user { login url avatarUrl }
                    email
                    name
                  }
                }
              }
            }
          }
        }
      }
    }`;
    const commitData = await proxyGraphQL<CommitHistoryData>(commitQuery, {
      owner: repo.owner,
      name: repo.name,
      max: Math.min(100, commitCap),
      branch,
    });

    const history = commitData.repository?.defaultBranchRef?.target?.history;
    const nodes = history?.nodes ?? [];

    // tally authors
    const map = new Map<
      string,
      MemberContribution & { additions: number; deletions: number }
    >();

    nodes.forEach((n: GitHubCommit) => {
      const author = n.author;
      const user = author?.user;
      const login = user?.login ?? author?.email ?? author?.name ?? "unknown";
      const avatarUrl = user?.avatarUrl ?? undefined;
      const url = user?.url ?? (user ? `https://github.com/${user.login}` : undefined);

      const cur = map.get(login) ?? {
        login,
        avatarUrl,
        url,
        commits: 0,
        prsOpened: 0,
        prsMerged: 0,
        issuesOpened: 0,
        additions: 0,
        deletions: 0,
      };
      cur.commits += 1;
      cur.additions = (cur.additions ?? 0) + (n.additions ?? 0);
      cur.deletions = (cur.deletions ?? 0) + (n.deletions ?? 0);
      map.set(login, cur);
    });

    // 2) For each author found, query PRs and Issues counts in that repo (using batched query)
    const logins = Array.from(map.keys()).slice(0, 30); // safety: limit aliases to 30
    if (logins.length > 0) {
      // build alias-based query
      const parts = logins
        .map((login, i) => {
          // We will query user(login) -> pullRequests/merged count and issues count in the target repository
          // Note: GraphQL doesn't provide direct "count of PRs in this specific repo by this author" easily except via search
          // We'll use search queries to count exactly in the repo.
          return `
          a${i}: search(query: "repo:${repo.owner}/${repo.name} is:pr author:${login}", type: ISSUE, first: 1) {
            issueCount
          }
          m${i}: search(query: "repo:${repo.owner}/${repo.name} is:pr is:merged author:${login}", type: ISSUE, first: 1) {
            issueCount
          }
          i${i}: search(query: "repo:${repo.owner}/${repo.name} is:issue author:${login}", type: ISSUE, first: 1) {
            issueCount
          }`;
        })
        .join("\n");

      const prIssueQuery = `query SearchCounts { ${parts} }`;
      const countsResp = await proxyGraphQL<SearchCountsData>(prIssueQuery, {});

      logins.forEach((login, i) => {
        const commitsObj = map.get(login)!;
        const prOpened = countsResp[`a${i}`]?.issueCount ?? 0;
        const prMerged = countsResp[`m${i}`]?.issueCount ?? 0;
        const issuesOpened = countsResp[`i${i}`]?.issueCount ?? 0;
        commitsObj.prsOpened = prOpened;
        commitsObj.prsMerged = prMerged;
        commitsObj.issuesOpened = issuesOpened;
        map.set(login, commitsObj);
      });
    }

    // Convert map to member list
    const members: MemberContribution[] = Array.from(map.values()).map((m) => ({
      login: m.login,
      avatarUrl: m.avatarUrl,
      url: m.url,
      commits: m.commits,
      prsOpened: m.prsOpened,
      prsMerged: m.prsMerged,
      issuesOpened: m.issuesOpened,
      additions: m.additions,
      deletions: m.deletions,
    }));

    return { ...repo, members };
  }

  const hasData = repos && repos.length > 0;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial, sans-serif" }}>
      <h2>Repository Contribution Report</h2>

      {loadingMe ? (
        <p>Checking login...</p>
      ) : me ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            {me.avatarUrl && (
              <Image
                src={me.avatarUrl}
                alt={me.login}
                width={36}
                height={36}
                style={{ borderRadius: 6 }}
                unoptimized
              />
            )}
          </div>
          <div>
            <strong>{me.login}</strong>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      ) : (
        <div>
          <p>You are not signed in.</p>
          <button onClick={handleLogin}>Sign in with GitHub</button>
        </div>
      )}

      {me && !hasData && (
        <div style={{ marginTop: 16 }}>
          <button onClick={fetchUserReposAndContributions} disabled={loadingRepos}>
            {loadingRepos ? "Loading repositories..." : "Load my repositories & contributions"}
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {hasData && (
        <div style={{ marginTop: 20 }}>
          {repos!.map((r) => (
            <section key={r.id} style={{ marginBottom: 28 }}>
              <h3>{r.nameWithOwner}</h3>
              {r.members.length === 0 ? (
                <p style={{ color: "#666" }}>No contributions found in scanned commits (or permissions limited).</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 8 }}>Member</th>
                        <th style={{ padding: 8 }}>Commits</th>
                        <th style={{ padding: 8 }}>PRs Opened</th>
                        <th style={{ padding: 8 }}>PRs Merged</th>
                        <th style={{ padding: 8 }}>Issues</th>
                        <th style={{ padding: 8 }}>Additions</th>
                        <th style={{ padding: 8 }}>Deletions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.members.map((m) => (
                        <tr key={m.login} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
                            {m.avatarUrl && (
                              <Image
                                src={m.avatarUrl}
                                alt={m.login}
                                width={28}
                                height={28}
                                style={{ borderRadius: 6 }}
                                unoptimized
                              />
                            )}
                            <a href={m.url ?? `https://github.com/${m.login}`} target="_blank" rel="noreferrer">
                              {m.login}
                            </a>
                          </td>
                          <td style={{ padding: 8 }}>{m.commits}</td>
                          <td style={{ padding: 8 }}>{m.prsOpened}</td>
                          <td style={{ padding: 8 }}>{m.prsMerged}</td>
                          <td style={{ padding: 8 }}>{m.issuesOpened}</td>
                          <td style={{ padding: 8 }}>{m.additions ?? "-"}</td>
                          <td style={{ padding: 8 }}>{m.deletions ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, color: "#666", fontSize: 13 }}>
        <p>
          Notes: This client fetches a capped set of recent commits per repo (for speed). For full historical counts,
          implement server-side cursor pagination across the commit history and aggregate server-side to avoid rate
          limits.
        </p>
      </div>
    </div>
  );
}
