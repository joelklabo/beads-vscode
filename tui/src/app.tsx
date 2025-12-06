import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import Core from '@beads/core';
import type { WorkspaceTarget } from '@beads/core';
import Headless from '@beads/ui-headless';
import NavBar, { Tab, TabId, ThemeMode } from './components/NavBar';
import BeadList from './components/BeadList';
import DependencyGraph from './components/DependencyGraph';
import { useKeymap } from './hooks/useKeymap';

export type AppProps = {
  cwd?: string;
  initialTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  onThemeChange?: (theme: ThemeMode) => void;
  simulateKeys?: string[]; // for tests: e.g., ['g','a'] or ['RIGHT']
  store?: BeadsStore;
  workspaces?: WorkspaceTarget[];
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
  store: providedStore,
  workspaces: providedWorkspaces,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [status, setStatus] = useState<string>('Press ? for help · g d/i/a/g/s to jump');
  const [theme, setTheme] = useState<ThemeMode>('auto');
  const { stdout } = useStdout();
  const tabIds = useMemo(() => tabs.map((t) => t.id), []);
  const worktree = formatWorktreeLabel(cwd);

  const workspaces = useMemo<WorkspaceTarget[]>(() => providedWorkspaces ?? [{ id: 'primary', root: cwd }], [providedWorkspaces, cwd]);
  const [store] = useState(() => {
    if (providedStore) return providedStore;
    const { BeadsStore } = Core as typeof import('@beads/core');
    return new BeadsStore({ onError: (err) => setStatus(String(err)) });
  });

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

  const { useBeadsView, useBeadDetail, useGraphData } = Headless as typeof import('@beads/ui-headless');

  const beadsView = useBeadsView({ workspaces, store });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const detail = useBeadDetail({ beadId: selectedId ?? beadsView.items[0]?.id ?? '', workspaces, store });
  const graph = useGraphData(workspaces, store);

  useEffect(() => {
    if (!selectedId && beadsView.items.length > 0) {
      setSelectedId(beadsView.items[0].id);
    }
  }, [selectedId, beadsView.items]);

  useEffect(
    () => () => {
      if (!providedStore) {
        store.dispose();
      }
    },
    [providedStore, store]
  );

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

  const renderActivePanel = (): React.ReactNode => {
    if (activeTab === 'issues') {
      return (
        <BeadList
          items={beadsView.items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={beadsView.loading}
        />
      );
    }

    if (activeTab === 'graph') {
      return <DependencyGraph nodes={graph.nodes} edges={graph.edges} />;
    }

    return (
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
          <Text dimColor>
            Loaded {beadsView.items.length} issues across {workspaces.length} workspace(s).
          </Text>
          {detail.bead ? (
            <Text dimColor wrap="truncate-end">
              Selected: {detail.bead.id} · {detail.bead.title}
            </Text>
          ) : null}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor={themeColor}>
      <Box marginBottom={1}>
        <Text color={themeColor}>
          {worktree} · {panelLabel(activeTab)} view
        </Text>
      </Box>

      <NavBar tabs={tabs} activeId={activeTab} onSelect={setTab} theme={theme} />

      {renderActivePanel()}

      <Box marginTop={1}>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  );
};

export default App;
