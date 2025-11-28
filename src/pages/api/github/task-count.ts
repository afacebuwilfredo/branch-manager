import type { NextApiRequest, NextApiResponse } from 'next';

const TASK_COUNT_QUERY = `
  query TaskCount($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
        }
      }
    }
  }
`;

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type SearchResponse = {
  search: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes: Array<{ id: string } | null>;
  };
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
    let cursor: string | null = null;
    let page = 0;
    const maxPages = 5;
    let count = 0;

    while (page < maxPages) {
      const data: SearchResponse = await performGraphQLRequest<SearchResponse>(token, TASK_COUNT_QUERY, {
        query: searchQuery,
        cursor
      });

      const nodes = data.search?.nodes ?? [];
      nodes.forEach((node) => {
        if (node?.id) {
          count += 1;
        }
      });

      const pageInfo = data.search?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
        break;
      }

      cursor = pageInfo.endCursor;
      page += 1;
    }

    return res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching task count:', error);
    return res.status(500).json({ error: 'Internal server error while fetching task count' });
  }
}


