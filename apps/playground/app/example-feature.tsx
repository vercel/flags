export default async function ExampleFeature() {
  const enabled = false;

  return enabled ? <On /> : <Off />;
}

function Off() {
  return (
    <article
      className="result-card"
      data-testid="example-feature"
      data-state="off"
    >
      <div className="card-label">enable-example-feature</div>
      <p className="flag-value">Off</p>
      <p className="card-note">
        The example feature is hidden for this visitor.
      </p>
    </article>
  );
}

function On() {
  return (
    <article
      className="result-card"
      data-testid="example-feature"
      data-state="on"
    >
      <div className="card-label">enable-example-feature</div>
      <p className="flag-value">On</p>
      <div className="context-panel" data-testid="example-feature-content">
        <p>
          Your new feature is ready. This content is only shown when the flag is
          on.
        </p>
      </div>
    </article>
  );
}
