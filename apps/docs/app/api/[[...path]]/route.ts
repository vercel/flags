import type { NextRequest } from "next/server";
import { notFoundError } from "@/lib/site/api-error";

const handler = (request: NextRequest) =>
  notFoundError(request.nextUrl.pathname);

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
