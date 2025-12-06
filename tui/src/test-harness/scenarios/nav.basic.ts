import { ScenarioSpec } from './types';

export const navBasic: ScenarioSpec = {
  id: 'nav-basic',
  title: 'Navigation baseline',
  description: 'Cycle across tabs to verify navbar focus and status messaging.',
  keys: ['RIGHT', 'RIGHT', 'g', 'a', 'g', 'g', 'LEFT', 't'],
  initialTab: 'dashboard',
  width: 80,
  height: 24,
};

export default navBasic;
