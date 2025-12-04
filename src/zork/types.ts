export type ZorkStepType = 'prompt' | 'choice' | 'command' | 'assert' | 'goto' | 'end';

export interface ZorkBaseStep {
  id: string;
  type: ZorkStepType;
  description?: string;
  when?: string; // optional condition expression; false => skip step
}

export interface PromptStep extends ZorkBaseStep {
  type: 'prompt';
  message: string;
  variable: string;
  defaultValue?: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  goto: string;
}

export interface ChoiceStep extends ZorkBaseStep {
  type: 'choice';
  message: string;
  options: ChoiceOption[];
}

export interface CommandStep extends ZorkBaseStep {
  type: 'command';
  command: string;
  args?: string[];
  cwd?: string;
  onError?: 'fail' | 'continue';
}

export interface AssertStep extends ZorkBaseStep {
  type: 'assert';
  expression: string;
  message?: string;
}

export interface GotoStep extends ZorkBaseStep {
  type: 'goto';
  target: string;
}

export interface EndStep extends ZorkBaseStep {
  type: 'end';
  status?: 'success' | 'failure' | 'cancel';
  message?: string;
}

export type ZorkStep =
  | PromptStep
  | ChoiceStep
  | CommandStep
  | AssertStep
  | GotoStep
  | EndStep;

export interface ZorkScript {
  steps: ZorkStep[];
  start?: string;
  name?: string;
  version?: string;
}

export interface RunnerContext {
  vars: Record<string, string>;
  currentStepId?: string;
}

export interface CommandResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export interface RunnerHooks {
  prompt?: (message: string, defaultValue: string | undefined, ctx: RunnerContext) => Promise<string> | string;
  choose?: (message: string, options: ChoiceOption[], ctx: RunnerContext) => Promise<string> | string;
  execCommand?: (cmd: string, args: string[] | undefined, cwd: string | undefined, ctx: RunnerContext) => Promise<CommandResult>;
  evaluate?: (expression: string, ctx: RunnerContext) => Promise<boolean> | boolean;
  log?: (message: string) => void;
}

export interface RunnerResult {
  status: 'success' | 'failure' | 'cancel';
  stepsRun: number;
  vars: Record<string, string>;
  lastMessage?: string;
}
