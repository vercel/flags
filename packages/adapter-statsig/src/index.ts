export { getProviderData } from './provider';

// import { Adapter } from '@vercel/flags';
// import { flag } from '@vercel/flags/next';

// // TODO allow adapter factories like createStatsigAdapter to set a default identify function
// // TODO implement adapter.flush
// // TODO go the AI SDK route and create a fully configured client?
// // TODO expose adapter.client
// function createStatsigAdapter(options: {}) {
//   // per adapter instance
//   return function statsigAdapter<ValueType, EntitiesType>(): Adapter<
//     ValueType,
//     EntitiesType
//   > {
//     // per flag instance
//     return {
//       initialize: () => {
//         return Promise.resolve();
//       },
//       identify: (): EntitiesType => {
//         return {} as EntitiesType;
//       },
//       decide: () => {
//         return 1 as ValueType;
//       },
//     };
//   };
// }

// const statsigAdapter = createStatsigAdapter({
//   consoleApiKey: 'consoleApiKey',
// });

// type ET = { user: { id: string } };

// export const exampleFlag = flag<string, ET>({
//   key: 'example',
//   adapter: statsigAdapter(),
//   async decide() {
//     return 'test';
//   },
// });

// // export const exampleFlag2 = flag(
// //   statsigAdapter<string, ET>({
// //     key: 'example',
// //     identify() {
// //       return { user: { id: 'joe' } };
// //     },
// //   }),
// // );
