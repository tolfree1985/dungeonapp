import assert from "node:assert/strict";
import {
  formatCreatorCapDetail,
  formatCreatorRetryAfterText,
  mapCreatorErrorMessage,
} from "../src/lib/creator/mapCreatorErrorMessage";

function main() {
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { error: "RATE_LIMITED" } }),
    "Rate limited. Try again later.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { error: "SCENARIO_CAP_EXCEEDED" } }),
    "Scenario cap reached for this owner.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { code: "MONTHLY_TOKEN_CAP_EXCEEDED" } }),
    "Monthly token cap exceeded.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { code: "CONCURRENCY_LIMIT_EXCEEDED" } }),
    "Another request is already in progress.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { code: "PER_TURN_OUTPUT_CAP_EXCEEDED" } }),
    "Per-turn output cap exceeded.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { code: "TURN_CAP" } }),
    "Turn cap reached for this tier.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 429, payload: { code: "REGEN_CAP" } }),
    "Regen cap reached for this tier.",
  );
  assert.equal(
    mapCreatorErrorMessage({ status: 400, payload: { error: "SOMETHING_ELSE" } }),
    "Request failed.",
  );

  assert.equal(formatCreatorCapDetail({}), "");
  assert.equal(formatCreatorCapDetail({ cap: 10 }), "cap=10");
  assert.equal(formatCreatorCapDetail({ cap: 10, used: 7, reserved: 2 }), "cap=10 used=7 reserved=2");

  assert.equal(
    formatCreatorRetryAfterText({
      status: 429,
      payload: { error: "RATE_LIMITED" },
      retryAfterHeader: "12",
    }),
    "Retry-After: 12",
  );
  assert.equal(
    formatCreatorRetryAfterText({
      status: 429,
      payload: { error: "RATE_LIMITED" },
      retryAfterHeader: null,
    }),
    "Retry-After: unavailable",
  );
  assert.equal(
    formatCreatorRetryAfterText({
      status: 429,
      payload: { code: "MONTHLY_TOKEN_CAP_EXCEEDED" },
      retryAfterHeader: "12",
    }),
    "",
  );

  console.log("CREATOR ERROR MAPPING OK");
}

main();
