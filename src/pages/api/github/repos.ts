import { NextApiRequest, NextApiResponse } from 'next';

// Get user's repositories using GitHub GraphQL API
const VIEWER_REPOS_QUERY = `
  query ViewerRepos {
    viewer {
      repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
        nodes {
          id
          nameWithOwner
        }
      }
      organizations(first: 100) {
        nodes {
          repositories(first: 100) {
            nodes {
              id
              nameWithOwner
            }
          }
        }
      }
    }
  }
`;

type GitHubGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type ViewerReposResponse = {
  viewer: {
    repositories: {
      nodes: Array<{
        id: string;
        nameWithOwner: string;
      }>;
    };
    organizations: {
      nodes: Array<{
        repositories: {
          nodes: Array<{
            id: string;
            nameWithOwner: string;
          }>;
        };
      }>;
    };
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get GitHub token from session cookie
  const token = req.cookies['gh_token'];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Call GitHub GraphQL API
    const graphqlResp = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: VIEWER_REPOS_QUERY,
      }),
    });

    if (!graphqlResp.ok) {
      const error = await graphqlResp.text();
      console.error('GitHub API error:', error);
      return res.status(graphqlResp.status).json({ 
        error: 'Failed to fetch repositories from GitHub',
        detail: error
      });
    }

    const body: GitHubGraphQLResponse<ViewerReposResponse> = await graphqlResp.json();

    if (body.errors) {
      console.error('GraphQL errors:', body.errors);
      return res.status(400).json({
        error: 'GraphQL query failed',
        detail: body.errors.map(e => e.message).join('; ')
      });
    }

    // Combine user's repos and org repos, removing duplicates
    const repos = new Set<string>();
    const repoObjects: Array<{ id: string; nameWithOwner: string }> = [];

    // Add user's direct repos
    const userRepos = body.data?.viewer.repositories.nodes ?? [];
    userRepos.forEach(repo => {
      if (!repos.has(repo.nameWithOwner)) {
        repos.add(repo.nameWithOwner);
        repoObjects.push(repo);
      }
    });

    // Add org repos
    const orgs = body.data?.viewer.organizations.nodes ?? [];
    orgs.forEach(org => {
      const orgRepos = org.repositories.nodes ?? [];
      orgRepos.forEach(repo => {
        if (!repos.has(repo.nameWithOwner)) {
          repos.add(repo.nameWithOwner);
          repoObjects.push(repo);
        }
      });
    });

    // Sort by nameWithOwner
    repoObjects.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));

    return res.status(200).json(repoObjects);

  } catch (error) {
    console.error('Error fetching repositories:', error);
    return res.status(500).json({ 
      error: 'Internal server error while fetching repositories'
    });
  }
}