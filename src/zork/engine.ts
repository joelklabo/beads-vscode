import { validateScript } from './schema';
import {
  ZorkScript,
  ZorkStep,
  RunnerHooks,
  RunnerResult,
  RunnerContext,
  CommandStep,
  AssertStep,
  ChoiceStep,
  PromptStep,
  CommandResult,
} from './types';

const MAX_STEPS = 1000;

export class ZorkEngine {
  constructor(private readonly hooks: RunnerHooks = {}) {}

  async run(rawScript: unknown, initialVars: Record<string, string> = {}): Promise<RunnerResult> {
    const script = validateScript(rawScript) as ZorkScript;
    const ctx: RunnerContext = { vars: { ...initialVars } };

    const idToStep = new Map<string, ZorkStep>();
    script.steps.forEach((s) => idToStep.set(s.id, s));
    const orderedIds = script.steps.map((s) => s.id);

    let currentId: string | undefined = script.start ?? orderedIds[0];
    let stepsRun = 0;
    let lastMessage: string | undefined;

    while (currentId) {
      const step = idToStep.get(currentId);
      if (!step) {
        throw new Error(`Step '${currentId}' not found`);
      }

      ctx.currentStepId = step.id;

      if (++stepsRun > MAX_STEPS) {
        throw new Error('Aborted: exceeded maximum step count');
      }

      // Skip step if condition fails
      if (step.when && !(await this.evaluate(step.when, ctx))) {
        currentId = this.nextSequential(currentId, orderedIds);
        continue;
      }

      switch (step.type) {
        case 'prompt':
          await this.runPrompt(step, ctx);
          currentId = this.nextSequential(currentId, orderedIds);
          break;
        case 'choice': {
          const next = await this.runChoice(step, ctx);
          currentId = next;
          break;
        }
        case 'command': {
          const result = await this.runCommand(step, ctx);
          if (result.code !== 0 && step.onError !== 'continue') {
            return { status: 'failure', stepsRun, vars: ctx.vars, lastMessage: result.stderr || result.stdout };
          }
          currentId = this.nextSequential(currentId, orderedIds);
          break;
        }
        case 'assert': {
          await this.runAssert(step, ctx);
          currentId = this.nextSequential(currentId, orderedIds);
          break;
        }
        case 'goto': {
          currentId = step.target;
          break;
        }
        case 'end': {
          return {
            status: step.status ?? 'success',
            stepsRun,
            vars: ctx.vars,
            lastMessage: step.message,
          };
        }
        default:
          throw new Error(`Unhandled step type ${(step as ZorkStep).type}`);
      }
    }

    return { status: 'success', stepsRun, vars: ctx.vars, lastMessage };
  }

  private nextSequential(currentId: string, order: string[]): string | undefined {
    const idx = order.indexOf(currentId);
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
  }

  private async runPrompt(step: PromptStep, ctx: RunnerContext): Promise<void> {
    const promptFn = this.hooks.prompt;
    if (!promptFn) {
      throw new Error(`No prompt handler provided for step ${step.id}`);
    }
    const value = await promptFn(step.message, step.defaultValue, ctx);
    ctx.vars[step.variable] = value ?? '';
  }

  private async runChoice(step: ChoiceStep, ctx: RunnerContext): Promise<string> {
    const chooseFn = this.hooks.choose;
    if (!chooseFn) {
      throw new Error(`No choice handler provided for step ${step.id}`);
    }
    const choiceId = await chooseFn(step.message, step.options, ctx);
    const selected = step.options.find((o) => o.id === choiceId || o.goto === choiceId);
    if (!selected) {
      throw new Error(`Choice '${choiceId}' not found in step ${step.id}`);
    }
    return selected.goto;
  }

  private async runCommand(step: CommandStep, ctx: RunnerContext): Promise<CommandResult> {
    const execFn = this.hooks.execCommand;
    if (!execFn) {
      throw new Error(`No command executor provided for step ${step.id}`);
    }
    const result = await execFn(step.command, step.args, step.cwd, ctx);
    return result;
  }

  private async runAssert(step: AssertStep, ctx: RunnerContext): Promise<void> {
    const ok = await this.evaluate(step.expression, ctx);
    if (!ok) {
      throw new Error(step.message || `Assertion failed: ${step.expression}`);
    }
  }

  private async evaluate(expr: string, ctx: RunnerContext): Promise<boolean> {
    if (!this.hooks.evaluate) {
      throw new Error('No evaluator provided for assert/when clauses');
    }
    return Boolean(await this.hooks.evaluate(expr, ctx));
  }
}

export async function runZorkScript(
  script: unknown,
  hooks: RunnerHooks = {},
  vars: Record<string, string> = {}
): Promise<RunnerResult> {
  const engine = new ZorkEngine(hooks);
  return engine.run(script, vars);
}
