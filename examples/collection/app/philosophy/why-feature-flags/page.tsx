import { Content } from '@/components/content';

export default function Page() {
  return (
    <Content crumbs={['philosophy', 'why-feature-flags']}>
      <h3>Why Feature Flags?</h3>
      <p>
        Feature flags, also known as feature toggles, significantly enhance the
        software development lifecycle. They offer developers granular control
        over feature visibility and functionality, providing numerous
        advantages.
      </p>
      <p>Key benefits include:</p>
      <ol>
        <li>
          <b>Releasing without stress</b>: Feature flags allow merging features
          to production without showing them to users yet. Safely enable new
          features for your team members only to ensure they work correctly, in
          production, before releasing them to all your users. Stress free.
        </li>
        <li>
          <b>Trunk based development</b>: Feature flags allow developers to
          merge unfinished features to the main branch, while keeping them
          hidden for users. This avoids merge conflicts once your feature is
          ready to be released to the public, as it will already be in the main
          branch.
        </li>
        <li>
          <b>Controlled Rollouts</b>: Gradually release features to a percentage
          of your visitors while monitoring health metrics, to identify and
          address issues before full-scale deployment.
        </li>
        <li>
          <b>Quick Rollbacks</b>: Being able to quickly disable a feature
          without having to wait for a timely revert or redeployment massively
          reduces risk.
        </li>
        <li>
          <b>User Segmentation</b>: Features can be selectively enabled for
          specific user groups or traffic percentages, allowing targeted
          releases and personalized experiences.
        </li>
        <li>
          <b>Technical Debt Management</b>: Flags can help manage and remove
          outdated code paths, facilitating cleaner codebases over time.
        </li>
        <li>
          <b>Compliance and Regulations</b>: They assist in meeting regulatory
          requirements by enabling or disabling features based on geographical
          or legal constraints.
        </li>
      </ol>
      <p>
        In essence, feature flags empower development teams to deploy
        frequently, and respond quickly to issues, ultimately leading to more
        robust, user-centric software development practices. Their integration
        throughout the development lifecycle promotes agility, reduces risk, and
        enhances overall product quality.
      </p>
      <p>
        <a href="https://martinfowler.com/articles/feature-toggles.html">
          Feature Toggles
        </a>{' '}
        by Pete Hodgson is highly recommended reading around the advantages of
        feature flags.
      </p>
    </Content>
  );
}
