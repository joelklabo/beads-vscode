import React from 'react';
import { Box, Text } from 'ink';

export type TabId = 'dashboard' | 'issues' | 'activity' | 'graph' | 'settings';

export interface Tab {
  id: TabId;
  label: string;
  hotkey: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';

interface NavBarProps {
  tabs: Tab[];
  activeId: TabId;
  onSelect: (id: TabId) => void;
  theme: ThemeMode;
}

const themeColors: Record<ThemeMode, { active: string; inactive: string; badge: string }> = {
  light: { active: 'cyan', inactive: 'gray', badge: 'black' },
  dark: { active: 'yellow', inactive: 'white', badge: 'white' },
  auto: { active: 'magenta', inactive: 'gray', badge: 'white' },
};

export const NavBar: React.FC<NavBarProps> = ({ tabs, activeId, onSelect, theme }) => {
  const colors = themeColors[theme];

  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap" marginBottom={1}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const borderColor = isActive ? colors.active : colors.inactive;
        const textColor = isActive ? colors.badge : colors.inactive;

        return (
          <Box
            key={tab.id}
            paddingX={1}
            paddingY={0}
            borderStyle="round"
            borderColor={borderColor}
            onClick={() => onSelect(tab.id)}
          >
            <Text color={textColor} inverse={isActive}>
              {isActive ? '● ' : '○ '}
              {tab.label}
              <Text dimColor> ({tab.hotkey})</Text>
            </Text>
          </Box>
        );
      })}
      <Box marginLeft={1}>
        <Text dimColor>
          Theme:
          <Text color={colors.active}> {theme}</Text>
        </Text>
      </Box>
    </Box>
  );
};

export default NavBar;
