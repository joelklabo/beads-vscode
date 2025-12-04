import * as assert from 'assert';
import { runZorkScript, ZorkEngine } from '../../zork/engine';
import { ZorkScript } from '../../zork/types';

const baseScript: ZorkScript = {
  steps: [
    { id: 'start', type: 'prompt', message: 'Name?', variable: 'name' },
    {
      id: 'ask-goal',
      type: 'choice',
      message: 'Pick path',
      options: [
        { id: 'a', label: 'Run cmd', goto: 'run' },
        { id: 'b', label: 'Skip', goto: 'end' },
      ],
    },
    { id: 'run', type: 'command', command: 'echo', args: ['hi'], onError: 'fail' },
    { id: 'ensure', type: 'assert', expression: 'vars.name === "alice"', message: 'must be alice' },
    { id: 'end', type: 'end', status: 'success', message: 'done' },
  ],
};

function makeEngineHooks(nameAnswer = 'alice') {
  return {
    prompt: async (msg: string) => {
      assert.strictEqual(msg, 'Name?');
      return nameAnswer;
    },
    choose: async (_msg: string, options: any[]) => options[0].id,
    execCommand: async () => ({ code: 0, stdout: 'ok' }),
    evaluate: async (expr: string, ctx: any) => {
      // super small evaluator for tests
      if (expr === 'vars.name === "alice"') {
        return ctx.vars.name === 'alice';
      }
      return false;
    },
  };
}

describe('ZorkEngine', () => {
  it('runs through happy path with prompt/choice/command/assert', async () => {
    const result = await runZorkScript(baseScript, makeEngineHooks());
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.vars.name, 'alice');
    assert.ok(result.stepsRun > 0);
  });

  it('fails assertion when evaluator returns false', async () => {
    const hooks = makeEngineHooks('bob');
    await assert.rejects(() => runZorkScript(baseScript, hooks), /must be alice/);
  });

  it('respects goto and end steps', async () => {
    const script: ZorkScript = {
      steps: [
        { id: 's1', type: 'goto', target: 'finish' },
        { id: 'finish', type: 'end', status: 'success', message: 'ok' },
      ],
    };

    const result = await runZorkScript(script, makeEngineHooks());
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.lastMessage, 'ok');
  });

  it('throws on missing handlers', async () => {
    const engine = new ZorkEngine({});
    await assert.rejects(() => engine.run(baseScript), /prompt handler/);
  });
});
