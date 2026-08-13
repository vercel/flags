import { Callout } from 'fumadocs-ui/components/callout';
import Link from 'next/link';
import { INSTALL_SKILL_COMMAND } from '@/lib/agent-skill';

export function InstallSkill() {
  return (
    <Callout title="Agent skill" type="info">
      Using an AI coding assistant? Install the Flags SDK skill with{' '}
      <code>{INSTALL_SKILL_COMMAND}</code> so it follows the recommended
      workflows. <Link href="/docs/agent-skill">Learn more</Link>.
    </Callout>
  );
}
