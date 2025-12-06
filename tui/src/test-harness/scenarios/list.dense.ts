import { ScenarioSpec } from './types';

export const listDense: ScenarioSpec = {
  id: 'list-dense',
  title: 'Dense issues list',
  description: 'Render issues tab with long titles/descriptions to exercise wrapping and truncation.',
  keys: [],
  initialTab: 'issues',
  width: 80,
  height: 24,
};

export default listDense;
