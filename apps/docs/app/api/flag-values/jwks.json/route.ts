import { flagValuesJwksResponse } from "@/lib/site/flag-values-jwks";

export const GET = () =>
  flagValuesJwksResponse(process.env.FLAG_VALUES_PUBLIC_KEY);
