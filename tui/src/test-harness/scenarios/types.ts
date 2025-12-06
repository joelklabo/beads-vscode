import type { TabId } from '../../components/NavBar';

export interface ScenarioSpec {
  /** Unique identifier used for filenames and reporting */
  id: string;
  /** Human-friendly title */
  title: string;
  /** What the scenario is exercising */
  description: string;
  /** Key presses to simulate in order */
  keys: string[];
  /** Optional starting tab */
  initialTab?: TabId;
  /** Desired terminal width/height for snapshots */
  width?: number;
  height?: number;
}

export type ScenarioMap = Record<string, ScenarioSpec>;
