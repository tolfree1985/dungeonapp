import { POST as createPost } from "../app/api/scenario/route";
import { publishPost } from "../app/api/scenario/[id]/publish/route";
import { NextRequest } from "next/server";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const createReq = new Request("http://local.test/api/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const createRes = await createPost(createReq);
  const createJson = await createRes.json();

  assert(createRes.status === 400, `create status mismatch: ${createRes.status}`);
  assert(createJson?.error === "id, title, contentJson required", "create error mismatch");
  assert(createJson?.code === "BAD_REQUEST", "create code mismatch");
  assert(!("stack" in (createJson ?? {})), "create error leaked stack");

  const publishMissingOwnerReq = new NextRequest("http://local.test/api/scenario/x/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const publishMissingOwnerRes = await publishPost(
    publishMissingOwnerReq,
    { params: { id: "scenario-does-not-exist" } } as any,
  );
  const publishMissingOwnerJson = await publishMissingOwnerRes.json();

  assert(publishMissingOwnerRes.status === 400, `publish(400) status mismatch: ${publishMissingOwnerRes.status}`);
  assert(publishMissingOwnerJson?.error === "ownerId required", "publish(400) error mismatch");
  assert(publishMissingOwnerJson?.code === "BAD_REQUEST", "publish(400) code mismatch");
  assert(!("stack" in (publishMissingOwnerJson ?? {})), "publish(400) error leaked stack");

  const publishNotFoundReq = new NextRequest("http://local.test/api/scenario/x/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: "owner_a" }),
  });
  const publishNotFoundRes = await publishPost(
    publishNotFoundReq,
    { params: { id: "scenario-does-not-exist" } } as any,
  );
  const publishNotFoundJson = await publishNotFoundRes.json();

  assert(publishNotFoundRes.status === 404, `publish(404) status mismatch: ${publishNotFoundRes.status}`);
  assert(publishNotFoundJson?.error === "SCENARIO_NOT_FOUND", "publish(404) error mismatch");
  assert(publishNotFoundJson?.code === "SCENARIO_NOT_FOUND", "publish(404) code mismatch");
  assert(!("stack" in (publishNotFoundJson ?? {})), "publish(404) error leaked stack");

  console.log("ROUTE SCENARIO ERROR ENVELOPE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
