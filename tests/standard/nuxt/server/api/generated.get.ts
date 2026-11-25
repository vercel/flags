import { enableSale } from 'flags:self';

// A flag of app.flags, through the alias flags:self of its source
export default defineEventHandler(async () => ({ sale: await enableSale() }));
