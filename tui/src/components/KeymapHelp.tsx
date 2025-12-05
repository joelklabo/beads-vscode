import React from 'react';
import { Box, Text } from 'ink';
import type { TabId } from './NavBar';

const rows = [
  { keys: '← / →', description: 'Move between tabs' },
  { keys: 'g d / i / a / g / s', description: 'Jump directly to Dashboard, Issues, Activity, Graph, Settings' },
  { keys: '/', description: 'Begin search (placeholder text only)' },
  { keys: '?', description: 'Toggle this help panel' },
  { keys: 't', description: 'Cycle theme (light, dark, auto)' },
];

const tabTips: Record<TabId, string> = {
  dashboard: 'Dashboard summarizes the workspace at a glance.',
  issues: 'Issues view will list beads with filters and keyboard navigation.',
  activity: 'Activity shows newest events; enter opens the selected issue.',
  graph: 'Graph view supports j/k or arrows to pan, z to zoom, e to export text.',
  settings: 'Settings collects flags including theme toggle and bd wiring.',
};

interface KeymapHelpProps {
  activeTab: TabId;
}

export const KeymapHelp: React.FC<KeymapHelpProps> = ({ activeTab }) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
    paddingY={0}
    marginTop={1}
  >
    <Text>Keyboard help (no mouse required)</Text>
    {rows.map((row) => (
      <Box key={row.keys} flexDirection="row" gap={1}>
        <Text bold>{row.keys.padEnd(10)}</Text>
        <Text>{row.description}</Text>
      </Box>
    ))}
    <Box marginTop={1}>
      <Text dimColor>{tabTips[activeTab]}</Text>
    </Box>
  </Box>
);

export default KeymapHelp;
