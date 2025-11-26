import { NextApiRequest, NextApiResponse } from 'next';
import { LRUCache } from 'lru-cache';

type CacheData = ContributionRow[];

// Simple in-memory cache with 1-hour TTL
const cache = new LRUCache<string, CacheData>({
  max: 500, // Store max 500 items
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

// GraphQL query to get contributions by user in a repository, paginated with cursor
const CONTRIBUTIONS_QUERY = `
  query ContributionsCollection($owner: String!, $name: String!, $from: GitTimestamp!, $to: GitTimestamp!, $after: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 100, since: $from, until: $to, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                author {
                  user { login }
                  email
                  name
                }
                committedDate
                additions
                deletions
              }
            }
          }
        }
      }
    }
  }
`;

interface GitHubGraphQLError {
  message: string;
}

interface GitHubGraphQLResponse<T> {
  data?: T;
  errors?: GitHubGraphQLError[];
}

interface CommitAuthor {
  user?: {
    login: string;
  };
  email?: string;
  name?: string;
}

interface CommitNode {
  author: CommitAuthor;
  committedDate: string;
  additions?: number;
  deletions?: number;
}

interface HistoryPage {
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
  nodes: CommitNode[];
}

interface ContributionsResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history: HistoryPage;
      };
    };
  };
}

type ContributionRow = {
  repository: string;
  member: string;
  memberDisplay: string;
  date: string;
  contributions: number;
  addedLines: number;
  removedLines: number;
};

async function fetchContributions(
  token: string,
  owner: string,
  name: string,
  startDate: string,
  endDate: string
): Promise<ContributionRow[]> {
  const cacheKey = `${owner}/${name}:${startDate}:${endDate}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Add one day to endDate since GitHub's until is exclusive
  const toDate = new Date(endDate);
  toDate.setDate(toDate.getDate() + 1);

  try {
    // Format dates as YYYY-MM-DDTHH:mm:ssZ for GitTimestamp
    const fromDate = new Date(startDate);
    fromDate.setUTCHours(0, 0, 0, 0);
    const formattedFrom = fromDate.toISOString().replace('.000Z', 'Z');

    const formattedTo = toDate.toISOString().replace('.000Z', 'Z');

    // Paginate through commit history using 'after' cursor
    let after: string | null = null;
    const allNodes: CommitNode[] = [];
    const maxPages = 50; // safety cap to avoid infinite loops
    let pageCount = 0;

    while (pageCount < maxPages) {
      pageCount += 1;

      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: CONTRIBUTIONS_QUERY,
          variables: {
            owner,
            name,
            from: formattedFrom,
            to: formattedTo,
            after,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`GitHub API error: ${await res.text()}`);
      }

      const data = await res.json() as GitHubGraphQLResponse<ContributionsResponse>;
      if (data.errors) {
        throw new Error(data.errors.map(e => e.message).join('; '));
      }

      const history = data.data?.repository?.defaultBranchRef?.target?.history;
      const nodes = history?.nodes ?? [];
      allNodes.push(...nodes);

      const pageInfo = history?.pageInfo;
      if (pageInfo && pageInfo.hasNextPage && pageInfo.endCursor) {
        after = pageInfo.endCursor;
        // short delay to be gentle on rate limits
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      break;
    }

    const contributions = new Map<
      string,
      Map<
        string,
        {
          memberDisplay?: string;
          contributions: number;
          addedLines: number;
          removedLines: number;
        }
      >
    >();

    allNodes.forEach((commit: CommitNode) => {
      const authorLogin = commit.author.user?.login?.trim();
      const authorEmail = commit.author.email?.trim();
      const authorName = commit.author.name?.trim();
      const memberId = authorLogin || authorEmail || authorName || 'unknown';
      const memberDisplay = authorName || authorLogin || authorEmail || 'unknown';
      const date = commit.committedDate.split('T')[0];
      const additions = commit.additions ?? 0;
      const deletions = commit.deletions ?? 0;

      if (!contributions.has(date)) {
        contributions.set(date, new Map());
      }
      const dateMap = contributions.get(date)!;
      const stats = dateMap.get(memberId) ?? {
        memberDisplay,
        contributions: 0,
        addedLines: 0,
        removedLines: 0,
      };
      if (!stats.memberDisplay && memberDisplay) {
        stats.memberDisplay = memberDisplay;
      }
      stats.contributions += 1;
      stats.addedLines += additions;
      stats.removedLines += deletions;
      dateMap.set(memberId, stats);
    });

    const rows: ContributionRow[] = [];

    for (const [date, authors] of contributions) {
      for (const [author, stats] of authors) {
        rows.push({
          repository: `${owner}/${name}`,
          member: author,
          memberDisplay: stats.memberDisplay ?? author,
          date,
          contributions: stats.contributions,
          addedLines: stats.addedLines,
          removedLines: stats.removedLines,
        });
      }
    }

    // Sort by date descending, then by contributions descending
    rows.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.contributions - a.contributions;
    });

    cache.set(cacheKey, rows);
    return rows;
  } catch (error) {
    console.error(`Error fetching contributions for ${owner}/${name}:`, error);
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.cookies['gh_token'];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const {
    repoFullNames,
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    page = 1,
    perPage = 50
  } = req.body;

  if (!Array.isArray(repoFullNames) || repoFullNames.length === 0) {
    return res.status(400).json({ error: 'repoFullNames must be a non-empty array' });
  }

  try {
    // Fetch contributions for all repositories in parallel
    const contributionPromises = repoFullNames.map(fullName => {
      const [owner, name] = fullName.split('/');
      return fetchContributions(token, owner, name, startDate, endDate);
    });

    const repoContributions = await Promise.all(contributionPromises);

    // Combine all contributions
    const allRows = repoContributions.flat();

    // Sort by date descending, then by contributions descending
    allRows.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.contributions - a.contributions;
    });

    // Calculate pagination
    const totalRows = allRows.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalRows);
    const paginatedRows = allRows.slice(startIndex, endIndex);

    return res.status(200).json({
      totalRows,
      page,
      perPage,
      rows: paginatedRows,
    });

  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({ 
      error: 'Internal server error while generating report'
    });
  }
}