import { defineFlag, evaluate } from 'flags';

// A flag without a connection has the types of the configured default
const teamFlag = defineFlag({ key: 'team-flag' });

teamFlag({ evaluationContext: { teamId: 't1' } });
// @ts-expect-error the configured default needs a teamId
teamFlag();
// @ts-expect-error teamId must be a string
teamFlag({ evaluationContext: { teamId: 1 } });

evaluate([teamFlag], { evaluationContext: { teamId: 't1' } });
// @ts-expect-error the configured default needs a teamId
evaluate([teamFlag]);
