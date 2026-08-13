import { Callout } from 'fumadocs-ui/components/callout';
import Link from 'next/link';
import { INSTALL_SKILL_COMMAND } from '@/lib/agent-skill';

export function InstallSkill() {
  return (
    <Callout title="Flags SDK agent skill" type="info">
      Install the Flags SDK agent skill with{' '}
      <code>{INSTALL_SKILL_COMMAND}</code> so your AI coding assistant follows
      the recommended workflows.{' '}
      <Link href="/docs/agent-skill">See the agent skill guide</Link>.
    </Callout>
  );
}
