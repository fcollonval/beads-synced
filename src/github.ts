import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import { LabelConfig } from './types';

export interface GitHubClientConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueParams {
  issueNumber: number;
  title?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  state?: 'open' | 'closed';
}

export interface GitHubIssue {
  number: number;
  id: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  labels: string[];
}

/**
 * GitHub API client wrapper with rate limiting and error handling
 */
export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubClientConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  /**
   * Create a new issue
   */
  async createIssue(params: CreateIssueParams): Promise<GitHubIssue> {
    const response = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
    });

    return {
      number: response.data.number,
      id: response.data.id,
      state: response.data.state as 'open' | 'closed',
      title: response.data.title,
      body: response.data.body ?? null,
      labels: response.data.labels.map((l) =>
        typeof l === 'string' ? l : l.name ?? ''
      ),
    };
  }

  /**
   * Update an existing issue
   */
  async updateIssue(params: UpdateIssueParams): Promise<GitHubIssue> {
    const response = await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: params.issueNumber,
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
      state: params.state,
    });

    return {
      number: response.data.number,
      id: response.data.id,
      state: response.data.state as 'open' | 'closed',
      title: response.data.title,
      body: response.data.body ?? null,
      labels: response.data.labels.map((l) =>
        typeof l === 'string' ? l : l.name ?? ''
      ),
    };
  }

  /**
   * Get an issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const response = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      });

      return {
        number: response.data.number,
        id: response.data.id,
        state: response.data.state as 'open' | 'closed',
        title: response.data.title,
        body: response.data.body ?? null,
        labels: response.data.labels.map((l) =>
          typeof l === 'string' ? l : l.name ?? ''
        ),
      };
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Close an issue with an optional comment
   */
  async closeIssue(
    issueNumber: number,
    comment?: string
  ): Promise<GitHubIssue> {
    if (comment) {
      await this.createComment(issueNumber, comment);
    }

    return this.updateIssue({
      issueNumber,
      state: 'closed',
    });
  }

  /**
   * Reopen an issue
   */
  async reopenIssue(issueNumber: number): Promise<GitHubIssue> {
    return this.updateIssue({
      issueNumber,
      state: 'open',
    });
  }

  /**
   * Create a comment on an issue
   */
  async createComment(
    issueNumber: number,
    body: string
  ): Promise<{ id: number }> {
    const response = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });

    return { id: response.data.id };
  }

  /**
   * Ensure a label exists, creating it if necessary
   */
  async ensureLabel(label: LabelConfig): Promise<void> {
    try {
      await this.octokit.issues.getLabel({
        owner: this.owner,
        repo: this.repo,
        name: label.name,
      });
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        await this.octokit.issues.createLabel({
          owner: this.owner,
          repo: this.repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
        core.info(`Created label: ${label.name}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Ensure all required labels exist
   */
  async ensureLabels(labels: LabelConfig[]): Promise<void> {
    for (const label of labels) {
      await this.ensureLabel(label);
    }
  }

  /**
   * Validate that an assignee is valid for this repository
   * Returns true if valid, false otherwise
   */
  async validateAssignee(username: string): Promise<boolean> {
    try {
      const response = await this.octokit.issues.checkUserCanBeAssigned({
        owner: this.owner,
        repo: this.repo,
        assignee: username,
      });
      return response.status === 204;
    } catch {
      return false;
    }
  }

  /**
   * Filter assignees to only valid ones for this repository
   */
  async filterValidAssignees(assignees: string[]): Promise<string[]> {
    const validAssignees: string[] = [];

    for (const assignee of assignees) {
      const isValid = await this.validateAssignee(assignee);
      if (isValid) {
        validAssignees.push(assignee);
      } else {
        core.warning(`Assignee "${assignee}" is not valid for this repository`);
      }
    }

    return validAssignees;
  }

  /**
   * List all issues with a specific label (paginated)
   * Returns both open and closed issues
   */
  async listIssuesByLabel(labelName: string): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];

    // Fetch open issues
    for await (const response of this.octokit.paginate.iterator(
      this.octokit.issues.listForRepo,
      {
        owner: this.owner,
        repo: this.repo,
        labels: labelName,
        state: 'all',
        per_page: 100,
      }
    )) {
      for (const issue of response.data) {
        // Skip pull requests (they're returned by the issues API)
        if (issue.pull_request) {
          continue;
        }
        issues.push({
          number: issue.number,
          id: issue.id,
          state: issue.state as 'open' | 'closed',
          title: issue.title,
          body: issue.body ?? null,
          labels: issue.labels.map((l) =>
            typeof l === 'string' ? l : l.name ?? ''
          ),
        });
      }
    }

    return issues;
  }
}
