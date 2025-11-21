export type GitHubUser = {
  login: string;
  url?: string;
  avatarUrl?: string;
};

export type GitHubCommitAuthor = {
  user?: GitHubUser;
  email?: string;
  name?: string;
};

export type GitHubCommit = {
  oid: string;
  committedDate: string;
  additions?: number;
  deletions?: number;
  author: GitHubCommitAuthor;
};

export type GitHubRepository = {
  id: string;
  name: string;
  nameWithOwner: string;
  owner: { login: string };
  defaultBranchRef?: { name: string };
};

export type GitHubCommitHistory = {
  totalCount: number;
  nodes: GitHubCommit[];
};

export type GitHubSearchResult = {
  issueCount: number;
};

export type GitHubGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};