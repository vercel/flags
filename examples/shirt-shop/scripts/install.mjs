import fs from "fs/promises";
import { execSync } from "child_process";

function install(command) {
  return execSync(command, { stdio: "inherit" });
}

/**
 * This script installs the dependencies for the project.
 *
 * You do not need this script in your own project and can simply delete it,
 * and delete `vercel.json`.
 *
 * We have it in this repository so we can use `workspace:*` dependencies during
 * development in github.com/vercel/flags and replace them with the real dependencies
 * when the repository is cloned.
 */
async function main() {
  if (process.env.VERCEL_PROJECT_ID === "prj_6Km3AvCCo0QgJSoEb3cFQwwB9x0Y") {
    // pnpm is necessary when installing for the vercel/flags monorepo
    install("pnpm install");
    return;
  }

  const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
  const templatePackageJson = { ...packageJson };

  // Replace workspace dependencies with real versions
  for (const [dep, version] of Object.entries(
    templatePackageJson.dependencies || {},
  )) {
    if (version.startsWith("workspace:")) {
      // Replace workspace dependencies with "latest" versions
      templatePackageJson.dependencies[dep] = "latest";
    }
  }

  await fs.writeFile("./package.json", JSON.stringify(templatePackageJson));

  // npm is necessary when installing for a template project
  install("npm install --legacy-peer-deps");
}

main();
