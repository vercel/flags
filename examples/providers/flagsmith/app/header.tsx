const exampleUrl =
  'https://github.com/vercel/flags/tree/main/examples/providers/flagsmith';

const deployUrl = `https://vercel.com/new/clone?${new URLSearchParams({
  'repository-url': exampleUrl,
  env: 'FLAGSMITH_ENVIRONMENT_KEY,FLAGSMITH_ENVIRONMENT_ID,FLAGSMITH_PROJECT_ID,FLAGS_SECRET',
  envDescription:
    'Flagsmith credentials for flag metadata and a random 32-byte, base64-encoded FLAGS_SECRET. See setup instructions.',
  envLink: `${exampleUrl}#setup`,
  'project-name': 'flags-sdk-flagsmith',
  'repository-name': 'flags-sdk-flagsmith',
})}`;

export function Header() {
  return (
    <nav className="example-header" aria-label="Example navigation">
      <div className="example-header-inner">
        <div className="example-header-brand">
          <a href="/" aria-label="Home" className="example-header-logo">
            <svg height="26" viewBox="0 0 75 65" fill="currentColor">
              <title>Vercel Logo</title>
              <path d="M37.59.25l36.95 64H.64l36.95-64z" />
            </svg>
          </a>
          <svg
            className="example-header-divider"
            viewBox="0 0 24 24"
            width="32"
            height="32"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            aria-hidden="true"
          >
            <path d="M16.88 3.549L7.12 20.451" />
          </svg>
          <a href="https://flags-sdk.dev" target="_blank" rel="noreferrer">
            Flags SDK
          </a>
          <svg
            className="example-header-divider"
            viewBox="0 0 24 24"
            width="32"
            height="32"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            aria-hidden="true"
          >
            <path d="M16.88 3.549L7.12 20.451" />
          </svg>
          <a href={exampleUrl} target="_blank" rel="noreferrer">
            Flagsmith
          </a>
        </div>
        <div className="example-header-actions">
          <a
            className="example-header-button"
            href="https://github.com/vercel/flags/tree/main/examples"
            target="_blank"
            rel="noreferrer"
          >
            More Examples →
          </a>
          <a
            className="example-header-button example-header-deploy"
            href={deployUrl}
            target="_blank"
            rel="noreferrer"
          >
            Clone &amp; Deploy
          </a>
        </div>
      </div>
    </nav>
  );
}
