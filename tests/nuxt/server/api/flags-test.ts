export default defineEventHandler(async (event) => {
  const example = await exampleFlag(event);
  const userRole = await userRoleFlag(event);

  return {
    exampleFlag: example,
    userRole,
    message: 'Flags evaluated in API route',
  };
});
