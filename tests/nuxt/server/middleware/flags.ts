import { hostFlag } from '#flags';

export default defineEventHandler(async (event) => {
  // Example of using flags in server middleware
  const host = await hostFlag(event);
  setHeader(event, 'x-evaluated-host', host);
});
