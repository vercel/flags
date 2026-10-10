export const dynamic = 'force-dynamic';
async function load() {
  try { return (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@fake/optional-core')).value; } catch (error) { return `missing: ${error?.message}`; }
}
export async function GET() { return Response.json({ result: await load() }); }
