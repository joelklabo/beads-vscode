import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import NavBar, { Tab, TabId, ThemeMode } from './components/NavBar';
import { useKeymap } from './hooks/useKeymap';

type AppProps = {
  cwd?: string;
  initialTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  onThemeChange?: (theme: ThemeMode) => void;
  simulateKeys?: string[]; // for tests: e.g., ['g','a'] or ['RIGHT']
};

const tabs: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', hotkey: 'g d' },
  { id: 'issues', label: 'Issues', hotkey: 'g i' },
  { id: 'activity', label: 'Activity', hotkey: 'g a' },
  { id: 'graph', label: 'Graph', hotkey: 'g g' },
  { id: 'settings', label: 'Settings', hotkey: 'g s' },
];

const nextTheme = (current: ThemeMode): ThemeMode => {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'auto';
  return 'light';
};

const panelText: Record<TabId, string> = {
  dashboard: 'At-a-glance metrics and shortcuts will live here.',
  issues: 'Browse and triage issues with filters and keyboard.',
  activity: 'Recent events across the project.',
  graph: 'Dependency and relationship graph.',
  settings: 'Tweak themes, flags, and data sources.',
};

const panelLabel = (id: TabId): string => tabs.find((t) => t.id === id)?.label ?? id;

const formatWorktreeLabel = (cwd: string): string => {
  const segments = cwd.split(/[/\\]/).filter(Boolean);
  const tail = segments[segments.length - 1] || 'main';
  return `wt:${tail}`;
};

export const App: React.FC<AppProps> = ({
  cwd = process.cwd(),
  initialTab = 'dashboard',
  onTabChange,
  onThemeChange,
  simulateKeys,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [status, setStatus] = useState<string>('Press ? for help · g d/i/a/g/s to jump');
  const [theme, setTheme] = useState<ThemeMode>('auto');
  const { stdout } = useStdout();
  const tabIds = useMemo(() => tabs.map((t) => t.id), []);
  const worktree = formatWorktreeLabel(cwd);

  const setTab = (id: TabId): void => {
    setActiveTab(id);
    onTabChange?.(id);
    setStatus(`Switched to ${panelLabel(id)}`);
  };

  const handleSearch = (): void => setStatus('Search is not wired yet (future work)');
  const handleHelp = (): void =>
    setStatus('Keys: ←/→, g d/i/a/g/s to jump, t cycle theme, / search (placeholder)');
  const handleThemeToggle = (): void => {
    const next = nextTheme(theme);
    setTheme(next);
    onThemeChange?.(next);
    setStatus(`Theme: ${next}`);
  };

  // Live keyboard handling
  useKeymap(tabIds, activeTab, setTab, {
    onHelp: handleHelp,
    onSearch: handleSearch,
    onThemeToggle: handleThemeToggle,
  });

  // Deterministic simulation for tests (no stdin reliance)
  const simulateRef = useRef(simulateKeys);
  const simulationRun = useRef(false);
  useEffect(() => {
    if (simulationRun.current || !simulateRef.current || simulateRef.current.length === 0) return;
    simulationRun.current = true;
    let pendingGoto = false;
    let current = initialTab;
    const goTo = (tab: TabId) => {
      current = tab;
      setTab(tab);
    };

    for (const key of simulateRef.current) {
      if (pendingGoto) {
        pendingGoto = false;
        const map: Record<string, TabId> = {
          d: 'dashboard',
          i: 'issues',
          a: 'activity',
          g: 'graph',
          s: 'settings',
        };
        const target = map[key.toLowerCase()];
        if (target) goTo(target);
        continue;
      }

      if (key === 'g') {
        pendingGoto = true;
        continue;
      }

      if (key === 'RIGHT') {
        const currentIndex = tabIds.indexOf(current);
        const nextIndex = (currentIndex + 1) % tabIds.length;
        goTo(tabIds[nextIndex]);
        continue;
      }

      if (key === 'LEFT') {
        const currentIndex = tabIds.indexOf(current);
        const nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
        goTo(tabIds[nextIndex]);
        continue;
      }

      if (key.toLowerCase() === 't') {
        handleThemeToggle();
      }
    }
  }, [initialTab, tabIds, handleThemeToggle]);

  const themeColor = theme === 'light' ? 'cyan' : theme === 'dark' ? 'yellow' : 'magenta';

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor={themeColor}>
      <Box marginBottom={1}>
        <Text color={themeColor}>
          {worktree} · {panelLabel(activeTab)} view
        </Text>
      </Box>

      <NavBar tabs={tabs} activeId={activeTab} onSelect={setTab} theme={theme} />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={themeColor}
        paddingX={1}
        paddingY={0}
        minHeight={stdout?.rows && stdout.rows > 20 ? 6 : 4}
      >
        <Text>
          <Text color={themeColor}>{panelLabel(activeTab)} · </Text>
          {panelText[activeTab]}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Layout adapts automatically; flexWrap handles narrow (≤80) widths.</Text>
          <Text dimColor>Use arrows or g-keys to move focus. Press t to cycle theme.</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  );
};

export default App;
