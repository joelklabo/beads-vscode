import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { FeedEvent, EventFilters, SectionedEvents } from '../state/eventsStore';
import { buildSections, relativeLabel } from '../state/eventsStore';

interface ActivityFeedProps {
  events: FeedEvent[];
  filters?: EventFilters;
  onRefresh?: () => void;
  onClearFilters?: () => void;
  onOpenIssue?: (issueId: string) => void;
  now?: Date;
}

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={0} flexDirection="column">
    <Text color="gray">{message}</Text>
    <Text dimColor>Press r to refresh or f to clear filters.</Text>
  </Box>
);

const EventRow: React.FC<{ event: FeedEvent }> = ({ event }) => {
  const originLabel = event.worktreeId ? `worktree ${event.worktreeId}` : 'main worktree';
  const iconLabel = event.icon ?? 'event';
  return (
    <Box flexDirection="row" gap={1}>
      <Text color="cyan">{iconLabel}</Text>
      <Text>{event.description}</Text>
      <Text dimColor>· {event.issueId}</Text>
      {event.actor ? <Text dimColor>· {event.actor}</Text> : null}
      <Text dimColor>· {originLabel}</Text>
      <Text dimColor>· {relativeLabel(new Date(event.createdAt))}</Text>
    </Box>
  );
};

const Section: React.FC<{ section: SectionedEvents; selectedIndex: number; baseIndex: number }> = ({
  section,
  selectedIndex,
  baseIndex,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="yellow">{section.title}</Text>
    {section.items.map((item, idx) => {
      const isSelected = selectedIndex === baseIndex + idx;
      return (
        <Box key={item.id} paddingLeft={1}>
          <Text inverse={isSelected}>{isSelected ? 'sel' : '  '}</Text>
          <EventRow event={item} />
          {isSelected ? <Text dimColor> (selected item)</Text> : null}
        </Box>
      );
    })}
  </Box>
);

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  events,
  filters,
  onRefresh,
  onClearFilters,
  onOpenIssue,
  now,
}) => {
  const sections = useMemo(() => buildSections(events, filters, now), [events, filters, now]);
  const [cursor, setCursor] = useState(0);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useInput((input, key) => {
    if (input === 'r') onRefresh?.();
    if (input === 'f') onClearFilters?.();

    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(flatItems.length - 1, c + 1));

    if (key.return && flatItems[cursor]) {
      onOpenIssue?.(flatItems[cursor].issueId);
    }
  });

  if (sections.length === 0) {
    return <EmptyState message="No activity found for these filters." />;
  }

  let indexBase = 0;
  return (
    <Box flexDirection="column" gap={1}>
      <Box>
        <Text dimColor>
          r = refresh · f = clear filters · arrows to move · enter to open
        </Text>
      </Box>
      {sections.map((section) => {
        const node = (
          <Section
            key={section.title}
            section={section}
            selectedIndex={cursor}
            baseIndex={indexBase}
          />
        );
        indexBase += section.items.length;
        return node;
      })}
    </Box>
  );
};

export default ActivityFeed;
