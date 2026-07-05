import { UserStoryResponse } from '../../data/discovery.models';
import { filterStories } from './stories';

function story(over: Partial<UserStoryResponse>): UserStoryResponse {
  return {
    id: over.id ?? 'id',
    projectId: 'p',
    sessionId: null,
    title: over.title ?? 'Title',
    role: over.role ?? 'role',
    action: over.action ?? 'action',
    benefit: 'benefit',
    priority: over.priority ?? 'MEDIUM',
    storyPoints: null,
    status: over.status ?? 'DRAFT',
  };
}

describe('filterStories', () => {
  const stories = [
    story({
      id: '1',
      title: 'Bulk import',
      role: 'admin',
      action: 'upload csv',
      priority: 'HIGH',
      status: 'DRAFT',
    }),
    story({
      id: '2',
      title: 'Export report',
      role: 'analyst',
      action: 'download pdf',
      priority: 'LOW',
      status: 'APPROVED',
    }),
    story({
      id: '3',
      title: 'Reset password',
      role: 'user',
      action: 'receive email',
      priority: 'MEDIUM',
      status: 'DRAFT',
    }),
  ];

  it('returns everything with no filters', () => {
    expect(filterStories(stories, '', 'all', 'all')).toHaveLength(3);
  });

  it('matches the query against title, role and action (case-insensitive)', () => {
    expect(filterStories(stories, 'CSV', 'all', 'all').map((s) => s.id)).toEqual(['1']);
    expect(filterStories(stories, 'analyst', 'all', 'all').map((s) => s.id)).toEqual(['2']);
    expect(filterStories(stories, 'email', 'all', 'all').map((s) => s.id)).toEqual(['3']);
  });

  it('filters by priority chip', () => {
    expect(filterStories(stories, '', 'HIGH', 'all').map((s) => s.id)).toEqual(['1']);
  });

  it('filters by status chip', () => {
    expect(filterStories(stories, '', 'all', 'DRAFT').map((s) => s.id)).toEqual(['1', '3']);
  });

  it('combines query, priority and status', () => {
    expect(filterStories(stories, 'reset', 'MEDIUM', 'DRAFT').map((s) => s.id)).toEqual(['3']);
    expect(filterStories(stories, 'reset', 'HIGH', 'DRAFT')).toHaveLength(0);
  });
});
