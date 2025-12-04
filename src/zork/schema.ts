import { z } from 'zod';
import { ZorkScript } from './types';

const stepId = z.string().min(1).max(128);
const expression = z.string().min(1).max(1024);

const stepType = z.enum(['prompt', 'choice', 'command', 'assert', 'goto', 'end']);

const baseStep = z.object({
  id: stepId,
  type: stepType,
  description: z.string().optional(),
  when: z.string().optional(),
});

const promptStep = baseStep.extend({
  type: z.literal('prompt'),
  message: z.string().min(1),
  variable: z.string().min(1),
  defaultValue: z.string().optional(),
});

const choiceOption = z.object({
  id: stepId,
  label: z.string().min(1),
  goto: stepId,
});

const choiceStep = baseStep.extend({
  type: z.literal('choice'),
  message: z.string().min(1),
  options: z.array(choiceOption).min(1),
});

const commandStep = baseStep.extend({
  type: z.literal('command'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  onError: z.enum(['fail', 'continue']).optional(),
});

const assertStep = baseStep.extend({
  type: z.literal('assert'),
  expression,
  message: z.string().optional(),
});

const gotoStep = baseStep.extend({
  type: z.literal('goto'),
  target: stepId,
});

const endStep = baseStep.extend({
  type: z.literal('end'),
  status: z.enum(['success', 'failure', 'cancel']).optional(),
  message: z.string().optional(),
});

const stepSchema = z.discriminatedUnion('type', [
  promptStep,
  choiceStep,
  commandStep,
  assertStep,
  gotoStep,
  endStep,
]);

type ParsedStep = z.infer<typeof stepSchema>;

const scriptSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  start: stepId.optional(),
  steps: z.array(stepSchema).min(1),
});

export function validateScript(input: unknown): ZorkScript {
  const parsed = scriptSchema.parse(input);

  const ids = new Set<string>();
  parsed.steps.forEach((s: ParsedStep) => {
    if (ids.has(s.id)) {
      throw new Error(`Duplicate step id: ${s.id}`);
    }
    ids.add(s.id);
  });

  const targetIds = new Set<string>();
  parsed.steps.forEach((s: ParsedStep) => {
    if (s.type === 'choice') {
      s.options.forEach((o) => targetIds.add(o.goto));
    }
    if (s.type === 'goto') {
      targetIds.add(s.target);
    }
  });

  targetIds.forEach((id) => {
    if (!ids.has(id)) {
      throw new Error(`Unknown step target: ${id}`);
    }
  });

  if (parsed.start && !ids.has(parsed.start)) {
    throw new Error(`Start step '${parsed.start}' does not exist`);
  }

  return parsed;
}

export type ScriptSchema = ReturnType<typeof validateScript>;
