import { enableSale } from 'flags:self';

// A flag of code generation, through the alias flags:self of the module
export default defineEventHandler(async () => ({ sale: await enableSale() }));
