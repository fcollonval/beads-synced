import { describe, it, expect } from 'vitest';
import {
  getLabelsForIssue,
  getAllRequiredLabels,
  getEpicLabel,
  getBeadsIdLabel,
  parseBeadsIdFromLabel,
  extractBeadsIdFromLabels,
} from '../src/labels';
import { BeadsIssue } from '../src/types';

describe('labels', () => {
  const baseIssue: BeadsIssue = {
    id: 'bd-test',
    title: 'Test',
    status: 'open',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  describe('getLabelsForIssue', () => {
    it('should include beads-synced marker by default', () => {
      const labels = getLabelsForIssue(baseIssue, { addSyncMarker: true });

      expect(labels).toContain('beads-synced');
    });

    it('should not include beads-synced marker when disabled', () => {
      const labels = getLabelsForIssue(baseIssue, { addSyncMarker: false });

      expect(labels).not.toContain('beads-synced');
    });

    it('should include priority label when priority is set', () => {
      const issue: BeadsIssue = { ...baseIssue, priority: 1 };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('priority:p1');
    });

    it('should include type label when issue_type is set', () => {
      const issue: BeadsIssue = { ...baseIssue, issue_type: 'bug' };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('type:bug');
    });

    it('should include beads-blocked label when status is blocked', () => {
      const issue: BeadsIssue = { ...baseIssue, status: 'blocked' };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('beads-blocked');
    });

    it('should include beads-in-progress label when status is in_progress', () => {
      const issue: BeadsIssue = { ...baseIssue, status: 'in_progress' };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('beads-in-progress');
    });

    it('should not include status label when status is open', () => {
      const issue: BeadsIssue = { ...baseIssue, status: 'open' };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).not.toContain('beads-blocked');
      expect(labels).not.toContain('beads-in-progress');
    });

    it('should not include status label when status is closed', () => {
      const issue: BeadsIssue = { ...baseIssue, status: 'closed' };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).not.toContain('beads-blocked');
      expect(labels).not.toContain('beads-in-progress');
    });

    it('should include custom labels from beads issue', () => {
      const issue: BeadsIssue = {
        ...baseIssue,
        labels: ['frontend', 'urgent'],
      };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('frontend');
      expect(labels).toContain('urgent');
    });

    it('should apply label prefix when configured', () => {
      const issue: BeadsIssue = {
        ...baseIssue,
        priority: 0,
        issue_type: 'feature',
      };

      const labels = getLabelsForIssue(issue, {
        addSyncMarker: true,
        labelPrefix: 'beads-',
      });

      expect(labels).toContain('beads-priority:p0');
      expect(labels).toContain('beads-type:feature');
      expect(labels).toContain('beads-beads-synced');
    });

    it('should include epic label for parent-child dependencies', () => {
      const issue: BeadsIssue = {
        ...baseIssue,
        dependencies: [{ id: 'bd-epic', type: 'parent-child' }],
      };

      const labels = getLabelsForIssue(issue, { addSyncMarker: false });

      expect(labels).toContain('epic:bd-epic');
    });

    it('should combine all label types correctly', () => {
      const issue: BeadsIssue = {
        ...baseIssue,
        priority: 2,
        issue_type: 'task',
        status: 'blocked',
        labels: ['my-label'],
        dependencies: [{ id: 'bd-parent', type: 'parent-child' }],
      };

      const labels = getLabelsForIssue(issue, { addSyncMarker: true });

      expect(labels).toContain('beads-synced');
      expect(labels).toContain('priority:p2');
      expect(labels).toContain('type:task');
      expect(labels).toContain('beads-blocked');
      expect(labels).toContain('my-label');
      expect(labels).toContain('epic:bd-parent');
    });
  });

  describe('getAllRequiredLabels', () => {
    it('should return all predefined labels', () => {
      const labels = getAllRequiredLabels();

      // Priority labels
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'priority:p0' })
      );
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'priority:p4' })
      );

      // Type labels
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'type:bug' })
      );
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'type:feature' })
      );

      // Special labels
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'beads-synced' })
      );
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'beads-blocked' })
      );
      expect(labels).toContainEqual(
        expect.objectContaining({ name: 'beads-in-progress' })
      );
    });

    it('should apply prefix to all labels when configured', () => {
      const labels = getAllRequiredLabels('myprefix-');

      expect(labels.every((l) => l.name.startsWith('myprefix-'))).toBe(true);
    });
  });

  describe('getEpicLabel', () => {
    it('should generate epic label name from beads ID', () => {
      expect(getEpicLabel('bd-abc123')).toBe('epic:bd-abc123');
    });

    it('should apply prefix when configured', () => {
      expect(getEpicLabel('bd-abc123', 'beads-')).toBe('beads-epic:bd-abc123');
    });
  });

  describe('getBeadsIdLabel', () => {
    it('should generate beads ID label', () => {
      expect(getBeadsIdLabel('bd-abc123')).toBe('beads-id:bd-abc123');
    });

    it('should apply prefix when configured', () => {
      expect(getBeadsIdLabel('bd-abc123', 'myprefix-')).toBe('myprefix-beads-id:bd-abc123');
    });
  });

  describe('parseBeadsIdFromLabel', () => {
    it('should extract beads ID from label', () => {
      expect(parseBeadsIdFromLabel('beads-id:bd-abc123')).toBe('bd-abc123');
    });

    it('should extract beads ID with prefix', () => {
      expect(parseBeadsIdFromLabel('myprefix-beads-id:bd-abc123', 'myprefix-')).toBe('bd-abc123');
    });

    it('should return null for non-beads-id labels', () => {
      expect(parseBeadsIdFromLabel('type:bug')).toBeNull();
      expect(parseBeadsIdFromLabel('beads-synced')).toBeNull();
      expect(parseBeadsIdFromLabel('priority:p1')).toBeNull();
    });

    it('should return null when prefix does not match', () => {
      expect(parseBeadsIdFromLabel('beads-id:bd-abc123', 'wrong-')).toBeNull();
    });
  });

  describe('extractBeadsIdFromLabels', () => {
    it('should find beads ID in array of labels', () => {
      const labels = ['type:bug', 'beads-synced', 'beads-id:bd-test123', 'priority:p1'];
      expect(extractBeadsIdFromLabels(labels)).toBe('bd-test123');
    });

    it('should return null if no beads ID label exists', () => {
      const labels = ['type:bug', 'beads-synced', 'priority:p1'];
      expect(extractBeadsIdFromLabels(labels)).toBeNull();
    });

    it('should handle prefix correctly', () => {
      const labels = ['myprefix-type:bug', 'myprefix-beads-id:bd-xyz', 'myprefix-beads-synced'];
      expect(extractBeadsIdFromLabels(labels, 'myprefix-')).toBe('bd-xyz');
    });

    it('should return first beads ID if multiple exist', () => {
      const labels = ['beads-id:bd-first', 'beads-id:bd-second'];
      expect(extractBeadsIdFromLabels(labels)).toBe('bd-first');
    });
  });

  describe('getLabelsForIssue - beads ID label', () => {
    it('should always include beads ID label', () => {
      const labels = getLabelsForIssue(baseIssue, { addSyncMarker: false });
      expect(labels).toContain('beads-id:bd-test');
    });

    it('should include beads ID label with prefix', () => {
      const labels = getLabelsForIssue(baseIssue, {
        addSyncMarker: false,
        labelPrefix: 'myprefix-',
      });
      expect(labels).toContain('myprefix-beads-id:bd-test');
    });
  });
});
