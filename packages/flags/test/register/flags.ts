import { bindFlag, defineSource, evaluate, runtime } from 'flags';
import hooks from './flags/hooks';

runtime.configure({ hooks });

const source = defineSource({
  provider: {
    metadata: { name: 'test' },
    resolveBooleanEvaluation: async () => ({ value: true }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (_request, context: { teamId: string }) => ({
    team: context.teamId,
  }),
});

// A flag has the types of its source
const teamFlag = bindFlag({ key: 'team-flag', source });

teamFlag({ evaluationContext: { teamId: 't1' } });
// @ts-expect-error the source needs a teamId
teamFlag();
// @ts-expect-error teamId must be a string
teamFlag({ evaluationContext: { teamId: 1 } });

evaluate([teamFlag], { evaluationContext: { teamId: 't1' } });
// @ts-expect-error the source needs a teamId
evaluate([teamFlag]);

// @ts-expect-error a flag of a provider needs its source
bindFlag({ key: 'no-source' });
