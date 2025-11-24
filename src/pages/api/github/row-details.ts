import type { NextApiRequest, NextApiResponse } from 'next';

const ROW_DETAILS_QUERY = `
  query RowDetails($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 25, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          headRefName
          changedFiles
          mergedAt
          updatedAt
          createdAt
          commits(last: 1) {
            nodes {
              commit {
                messageHeadline
                committedDate
              }
            }
          }
          reviews(states: APPROVED, last: 10) {
            nodes {
              author {
                login
              }
              submittedAt
            }
          }
        }
      }
    }
  }
`;

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type PullRequestNode = {
  id: string;
  number: number;
  title: string;
  url: string;
  headRefName?: string | null;
  changedFiles?: number | null;
  mergedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  commits?: {
    nodes?: Array<{
      commit?: {
        messageHeadline?: string | null;
        committedDate: string;
      } | null;
    } | null>;
  } | null;
  reviews?: {
    nodes?: Array<{
      author?: {
        login?: string | null;
      } | null;
      submittedAt: string;
    } | null>;
  } | null;
};

type SearchResponse = {
  search: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes: Array<PullRequestNode | null>;
  };
};

type PullRequestDetailRow = {
  id: string;
  branchName: string;
  fileChanges: number;
  commitName: string;
  approvedBy: string | null;
  date: string;
  pullRequestUrl: string;
};

const performGraphQLRequest = async <T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'GitHub GraphQL request failed');
  }

  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map((err) => err.message).join('; '));
  }

  if (!body.data) {
    throw new Error('GitHub GraphQL response missing data');
  }

  return body.data;
};

const getLatestApproval = (node: PullRequestNode): string | null => {
  const approvals =
    node.reviews?.nodes
      ?.filter((review): review is NonNullable<typeof review> => Boolean(review?.author?.login))
      .sort(
        (a, b) =>
          new Date(b!.submittedAt).getTime() - new Date(a!.submittedAt).getTime()
      ) ?? [];

  if (!approvals.length) {
    return null;
  }

  return approvals[0]!.author!.login ?? null;
};

const transformNodeToRow = (node: PullRequestNode): PullRequestDetailRow => {
  const latestCommit = node.commits?.nodes?.find((commitNode) => Boolean(commitNode?.commit))?.commit;
  const commitHeadline = latestCommit?.messageHeadline?.trim();
  const date = node.mergedAt ?? node.updatedAt ?? node.createdAt;

  return {
    id: node.id,
    branchName: node.headRefName ?? 'unknown',
    fileChanges: node.changedFiles ?? 0,
    commitName: commitHeadline && commitHeadline.length > 0 ? commitHeadline : node.title,
    approvedBy: getLatestApproval(node),
    date,
    pullRequestUrl: node.url
  };
};

const buildSearchQuery = (repoFullName: string, member: string, date: string) =>
  `repo:${repoFullName} is:pr author:${member.trim()} updated:${date}..${date}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.cookies['gh_token'];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { repository, member, date } = req.body ?? {};

  if (typeof repository !== 'string' || !repository.includes('/')) {
    return res.status(400).json({ error: 'repository must be a string in owner/name format' });
  }

  if (typeof member !== 'string' || member.trim().length === 0) {
    return res.status(400).json({ error: 'member must be a non-empty string' });
  }

  if (typeof date !== 'string' || date.trim().length === 0) {
    return res.status(400).json({ error: 'date must be a non-empty string (YYYY-MM-DD)' });
  }

  const searchQuery = buildSearchQuery(repository, member, date);

  try {
    const rows: PullRequestDetailRow[] = [];
    let cursor: string | null = null;
    let page = 0;
    const maxPages = 5;

    while (page < maxPages) {
      const data: SearchResponse = await performGraphQLRequest<SearchResponse>(token, ROW_DETAILS_QUERY, {
        query: searchQuery,
        cursor
      });

      const nodes: Array<PullRequestNode | null> = data.search?.nodes ?? [];
      nodes
        .filter((node: PullRequestNode | null): node is PullRequestNode => Boolean(node))
        .forEach((node: PullRequestNode) => {
          rows.push(transformNodeToRow(node));
        });

      const pageInfo: { hasNextPage: boolean; endCursor?: string | null } | undefined = data.search?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
        break;
      }

      cursor = pageInfo.endCursor;
      page += 1;
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));

    return res.status(200).json({ rows });
  } catch (error) {
    console.error('Error fetching row details:', error);
    return res.status(500).json({ error: 'Internal server error while fetching row details' });
  }
}

