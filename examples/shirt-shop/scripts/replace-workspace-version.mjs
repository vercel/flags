import fs from 'fs/promises';

async function prepareTemplate() {
  if (
    process.env.CI === '1' &&
    process.env.VERCEL_PROJECT_ID === 'prj_6Km3AvCCo0QgJSoEb3cFQwwB9x0Y'
  ) {
    return;
  }

  // Read the package.json
  const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));

  // Create a copy for the template
  const templatePackageJson = { ...packageJson };

  // Replace workspace dependencies with real versions
  for (const [dep, version] of Object.entries(
    templatePackageJson.dependencies || {},
  )) {
    if (version.startsWith('workspace:')) {
      // Replace with the actual version you want
      templatePackageJson.dependencies[dep] = 'latest';
    }
  }

  // Write the template package.json
  await fs.writeFile('./package.json', JSON.stringify(templatePackageJson));
}

prepareTemplate();
