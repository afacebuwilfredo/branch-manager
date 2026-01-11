import { NextApiRequest, NextApiResponse } from 'next';

// Get user's repositories using GitHub GraphQL API
const VIEWER_REPOS_QUERY = `
  query ViewerRepos($userReposCursor: String, $orgsReposCursor: String, $orgsCursor: String) {
    viewer {
      repositories(first: 100, after: $userReposCursor, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          nameWithOwner
        }
      }
      organizations(first: 100, after: $orgsCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          repositories(first: 100, after: $orgsReposCursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
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
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: Array<{
        id: string;
        nameWithOwner: string;
      }>;
    };
    organizations: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: Array<{
        repositories: {
          pageInfo: {
            hasNextPage: boolean;
            endCursor: string | null;
          };
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
    const repos = new Set<string>();
    const repoObjects: Array<{ id: string; nameWithOwner: string }> = [];

    let userReposCursor: string | null = null;
    let orgsCursor: string | null = null;
    let hasMoreUserRepos = true;
    let hasMoreOrgs = true;

    // Fetch all user repos and org repos with pagination
    while (hasMoreUserRepos || hasMoreOrgs) {
      const graphqlResp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: VIEWER_REPOS_QUERY,
          variables: {
            userReposCursor,
            orgsReposCursor: null, // Reset for each org fetch
            orgsCursor,
          },
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

      // Add user's direct repos
      const userRepos = body.data?.viewer.repositories.nodes ?? [];
      userRepos.forEach(repo => {
        if (!repos.has(repo.nameWithOwner)) {
          repos.add(repo.nameWithOwner);
          repoObjects.push(repo);
        }
      });

      // Update pagination cursor for user repos
      const userReposPageInfo = body.data?.viewer.repositories.pageInfo;
      if (userReposPageInfo?.hasNextPage) {
        userReposCursor = userReposPageInfo.endCursor;
      } else {
        hasMoreUserRepos = false;
      }

      // Add org repos
      const orgs = body.data?.viewer.organizations.nodes ?? [];
      for (const org of orgs) {
        let orgReposCursor: string | null = null;
        let hasMoreOrgRepos = true;

        while (hasMoreOrgRepos) {
          const orgReposResp = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
              'Authorization': `bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `
                query OrgRepos($orgReposCursor: String) {
                  organization(login: "${org.repositories.nodes[0]?.nameWithOwner.split('/')[0] || ''}}") {
                    repositories(first: 100, after: $orgReposCursor) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      nodes {
                        id
                        nameWithOwner
                      }
                    }
                  }
                }
              `,
              variables: {
                orgReposCursor,
              },
            }),
          });

          if (!orgReposResp.ok) {
            hasMoreOrgRepos = false;
            continue;
          }

          const orgReposBody: GitHubGraphQLResponse<any> = await orgReposResp.json();
          
          if (orgReposBody.data?.organization?.repositories?.nodes) {
            const orgRepos = orgReposBody.data.organization.repositories.nodes;
            orgRepos.forEach((repo: any) => {
              if (!repos.has(repo.nameWithOwner)) {
                repos.add(repo.nameWithOwner);
                repoObjects.push(repo);
              }
            });

            const pageInfo = orgReposBody.data.organization.repositories.pageInfo;
            if (pageInfo?.hasNextPage) {
              orgReposCursor = pageInfo.endCursor;
            } else {
              hasMoreOrgRepos = false;
            }
          } else {
            hasMoreOrgRepos = false;
          }
        }
      }

      // Update pagination cursor for orgs
      const orgsPageInfo = body.data?.viewer.organizations.pageInfo;
      if (orgsPageInfo?.hasNextPage) {
        orgsCursor = orgsPageInfo.endCursor;
      } else {
        hasMoreOrgs = false;
      }
    }

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