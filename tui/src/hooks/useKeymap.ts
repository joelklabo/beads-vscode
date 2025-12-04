import { useInput } from 'ink';
import { useRef } from 'react';
import type { TabId } from '../components/NavBar';

interface KeymapOptions {
  onSearch?: () => void;
  onHelp?: () => void;
  onThemeToggle?: () => void;
}

const gotoMap: Record<string, TabId> = {
  d: 'dashboard',
  i: 'issues',
  a: 'activity',
  g: 'graph',
  s: 'settings',
};

export function useKeymap(
  tabs: TabId[],
  activeId: TabId,
  onNavigate: (id: TabId) => void,
  options?: KeymapOptions
): void {
  const pendingGoto = useRef(false);

  const move = (delta: number): void => {
    const currentIndex = tabs.indexOf(activeId);
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
    onNavigate(tabs[nextIndex]);
  };

  useInput((input, key) => {
    // Two-key chord: g <key>
    if (pendingGoto.current) {
      pendingGoto.current = false;
      const target = gotoMap[input.toLowerCase()];
      if (target) {
        onNavigate(target);
      }
      return;
    }

    if (input === 'g') {
      pendingGoto.current = true;
      return;
    }

    if (key.leftArrow) {
      move(-1);
      return;
    }

    if (key.rightArrow) {
      move(1);
      return;
    }

    if (input === '/') {
      options?.onSearch?.();
      return;
    }

    if (input === '?') {
      options?.onHelp?.();
      return;
    }

    if (input.toLowerCase() === 't') {
      options?.onThemeToggle?.();
    }
  });
}

export default useKeymap;
