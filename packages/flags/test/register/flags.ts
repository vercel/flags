import { bindFlag, evaluate } from 'flags';

// A flag without a source has the types of the configured default
const teamFlag = bindFlag({ key: 'team-flag' });

teamFlag({ evaluationContext: { teamId: 't1' } });
// @ts-expect-error the configured default needs a teamId
teamFlag();
// @ts-expect-error teamId must be a string
teamFlag({ evaluationContext: { teamId: 1 } });

evaluate([teamFlag], { evaluationContext: { teamId: 't1' } });
// @ts-expect-error the configured default needs a teamId
evaluate([teamFlag]);
