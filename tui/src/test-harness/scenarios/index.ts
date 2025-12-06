import navBasic from './nav.basic';
import listDense from './list.dense';
import graphBasic from './graph.basic';
import { ScenarioMap } from './types';

export const scenarios: ScenarioMap = {
  [navBasic.id]: navBasic,
  [listDense.id]: listDense,
  [graphBasic.id]: graphBasic,
};

export { navBasic, listDense, graphBasic };
export * from './types';
