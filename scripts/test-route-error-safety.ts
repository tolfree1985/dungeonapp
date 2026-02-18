import assert from "node:assert/strict";
import { GET as getPublicRoute } from "../app/api/scenario/public/route";
import { prisma } from "../src/lib/prisma";

async function main() {
  const prismaAny = prisma as any;
  const originalTransaction = prismaAny.$transaction?.bind(prisma);
  const originalConsoleError = console.error;

  try {
    console.error = () => {};
    prismaAny.$transaction = async () => {
      throw new Error("FORCED_ROUTE_ERROR");
    };

    const req = new Request("http://local.test/api/scenario/public?take=20");
    const res = await getPublicRoute(req);
    const body = await res.json();

    assert.equal(res.status, 500, "expected 500");
    assert.deepEqual(body, { error: "Internal error" }, "response body must be exactly { error: \"Internal error\" }");
    assert.equal(Object.keys(body).length, 1, "response must not include extra fields");

    console.log("ROUTE ERROR SAFETY OK");
  } finally {
    if (originalTransaction) prismaAny.$transaction = originalTransaction;
    console.error = originalConsoleError;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
