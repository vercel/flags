export const exampleFlag = defineFlag<boolean>({
  key: 'example-flag',
  description: 'An example boolean flag',
  decide: () => true,
  defaultValue: false,
  options: [{ value: false }, { value: true }],
});

export const hostFlag = defineFlag<string>({
  key: 'host',
  description: 'Flag that reads the host header',
  decide: ({ headers }) => headers.get('host') || 'no host',
  options: [{ value: 'no host' }, { value: 'localhost' }],
});

export const cookieFlag = defineFlag<string>({
  key: 'cookie',
  description: 'Flag that reads cookies',
  decide: ({ cookies }) => cookies.get('example-cookie')?.value || 'no cookie',
  options: [{ value: 'no cookie' }, { value: 'nav-test-value' }],
});

export const userRoleFlag = defineFlag<string>({
  key: 'user-role',
  description: 'Flag for user role based features',
  decide: ({ cookies }) => cookies.get('user-role')?.value || 'guest',
  defaultValue: 'guest',
  options: [{ value: 'guest' }, { value: 'user' }, { value: 'admin' }],
});

export const featureToggleFlag = defineFlag<boolean>({
  key: 'feature-toggle',
  description: 'Simple feature toggle',
  decide: () => false,
  defaultValue: false,
  options: [{ value: false }, { value: true }],
});
