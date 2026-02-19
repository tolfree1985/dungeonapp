import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  assertSupportManifestConsistency,
  buildSupportManifestFromBundle,
  serializeSupportManifest,
} from "../src/lib/support/supportManifest";
import { SUPPORT_PACKAGE_VERSION } from "../src/lib/support/supportPackage";
import {
  REPLAY_GUARD_ORDER,
  assertDeltaApplyIdempotency,
  assertFailForwardInvariant,
  assertLedgerConsistency,
  assertStateDeltaShape,
  assertTurnMonotonicity,
  replayStateFromTurnJson,
  replayStateFromTurnJsonWithGuardSummary,
} from "../src/lib/game/replay";
import { roll2d6 as resolveRoll2d6, tierFor2d6 } from "../src/lib/game/resolve";

function extractSection(output: string, startMarker: string, endMarker?: string): string {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === startMarker);
  assert(start >= 0, `missing marker: ${startMarker}`);
  const end = endMarker ? lines.findIndex((line, idx) => idx > start && line.trim() === endMarker) : -1;
  const slice = end > start ? lines.slice(start, end) : lines.slice(start);
  return slice.join("\n").trim();
}

function fixedRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    const value = values[idx] ?? values[values.length - 1] ?? 0;
    idx += 1;
    return value;
  };
}

async function main() {
  const scriptPath = path.join(process.cwd(), "scripts", "replay-from-bundle.ts");
  const buildSupportPackageScriptPath = path.join(process.cwd(), "scripts", "build-support-package.ts");
  const bundle = {
    bundleId: "bundle-test-1",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    adventureId: "adv-test",
    buildVersion: "build-test",
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ kind: "time", msg: "time +1" }],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", key: "dockSeen", value: true }],
        ledgerAdds: [{ kind: "flag", msg: "dockSeen true" }],
      },
      {
        turnIndex: 2,
        stateDeltas: [{ op: "inv.add", item: { id: "key", name: "Rusty Key", qty: 1 } }],
        ledgerAdds: [{ kind: "inventory", msg: "Added key" }],
      },
    ],
  };

  const manifestA = await buildSupportManifestFromBundle(bundle);
  const manifestB = await buildSupportManifestFromBundle(bundle);
  assert.equal(
    serializeSupportManifest(manifestA),
    serializeSupportManifest(manifestB),
    "expected replay manifest to be idempotent across runs",
  );
  assert.equal(
    manifestA.replay.finalStateHash,
    manifestB.replay.finalStateHash,
    "expected replay final state hash to be idempotent",
  );
  assert.deepEqual(
    manifestA.telemetry,
    manifestB.telemetry,
    "expected replay telemetry to be idempotent across runs",
  );

  assert.doesNotThrow(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", key: "dockSeen", value: true }),
    "expected valid state delta shape to pass",
  );
  assert.doesNotThrow(
    () =>
      assertFailForwardInvariant([
        {
          seq: 0,
          turnJson: {
            resolution: { tier: "fail" },
            deltas: [{ op: "flag.set", key: "failed_once", value: true, path: "flags.failed_once" }],
            ledgerAdds: [{ id: "ledger_failforward_invariant_0", turnIndex: 0 }],
          },
        },
      ]),
    "expected fail-forward invariant to pass when failure applies a state mutation",
  );
  assert.throws(
    () =>
      assertFailForwardInvariant([
        {
          seq: 0,
          turnJson: {
            resolution: { tier: "fail" },
            deltas: [],
            ledgerAdds: [],
          },
        },
      ]),
    /FAIL_FORWARD_VIOLATION/,
    "expected fail-forward invariant to fail when failure has no progression",
  );
  assert.throws(
    () =>
      assertFailForwardInvariant([
        {
          seq: 0,
          turnJson: {
            resolution: { tier: "fail" },
            deltas: [],
            ledgerAdds: [{ id: "ledger_complication_only_0", turnIndex: 0, kind: "complication" }],
          },
        },
      ]),
    /FAIL_FORWARD_VIOLATION/,
    "expected fail-forward invariant to fail when failure lacks allowed progression signal",
  );
  assert.doesNotThrow(
    () =>
      assertFailForwardInvariant([
        {
          seq: 0,
          turnJson: {
            resolution: { tier: "fail" },
            tags: ["system/no-ledger"],
            deltas: [],
            ledgerAdds: [],
          },
        },
      ]),
    "expected fail-forward invariant to pass for explicit system/no-ledger exception path",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "", key: "dockSeen", value: true }),
    /STATE_DELTA_PATH_INVALID/,
    "expected empty delta path to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: { createdAt: "x" } }),
    /STATE_DELTA_FORBIDDEN_KEY/,
    "expected forbidden timestamp-like key to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: () => "x" }),
    /STATE_DELTA_FUNCTION_VALUE/,
    "expected function-valued delta payload to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: new Date() }),
    /STATE_DELTA_DATE_VALUE/,
    "expected date-valued delta payload to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: Number.NaN }),
    /DELTA_VALUE_INVALID/,
    "expected NaN delta payload to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: Number.POSITIVE_INFINITY }),
    /DELTA_VALUE_INVALID/,
    "expected infinite delta payload to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "flags.dockSeen", value: BigInt(1) }),
    /DELTA_VALUE_INVALID/,
    "expected bigint delta payload to fail",
  );
  assert.throws(
    () => assertStateDeltaShape({ op: "flag.set", path: "stats.hp", value: 10.5 }),
    /DELTA_VALUE_INVALID/,
    "expected float stats delta payload to fail",
  );

  assert.doesNotThrow(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            ledgerAdds: [{ id: "ledger_ok_0", turnIndex: 0 }],
          },
        },
      ]),
    "expected valid ledger consistency to pass",
  );
  assert.throws(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            ledgerAdds: [{ id: "ledger_bad_ref", turnIndex: 3 }],
          },
        },
      ]),
    /LEDGER_REFERENCE_INVALID/,
    "expected invalid ledger reference to fail",
  );
  assert.throws(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [],
            ledgerAdds: [{ id: "ledger_without_delta", turnIndex: 0 }],
          },
        },
      ]),
    /LEDGER_DELTA_COUPLING_VIOLATION/,
    "expected ledger entry without delta to fail",
  );
  assert.throws(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            ledgerAdds: [],
          },
        },
      ]),
    /LEDGER_DELTA_COUPLING_VIOLATION/,
    "expected delta entry without ledger to fail",
  );
  assert.doesNotThrow(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            tags: ["system/no-ledger"],
            ledgerAdds: [],
          },
        },
      ]),
    "expected system/no-ledger tagged turn to pass delta/ledger coupling guard",
  );
  assert.throws(
    () =>
      assertLedgerConsistency([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            ledgerAdds: [{ id: "dup-ledger", turnIndex: 0 }],
          },
        },
        {
          seq: 1,
          turnJson: {
            deltas: [{ op: "time.inc", by: 1 }],
            ledgerAdds: [{ id: "dup-ledger", turnIndex: 1 }],
          },
        },
      ]),
    /LEDGER_DUPLICATE_ID/,
    "expected duplicate ledger ids to fail",
  );

  assert.doesNotThrow(
    () =>
      assertTurnMonotonicity([
        { seq: 0, turnJson: { deltas: [] } },
        { seq: 1, turnJson: { deltas: [] } },
      ]),
    "expected monotonic turn sequence to pass",
  );
  assert.throws(
    () =>
      assertTurnMonotonicity([
        { seq: 1, turnJson: { deltas: [] } },
        { seq: 0, turnJson: { deltas: [] } },
      ]),
    /TURN_INDEX_ZERO_REGRESSION/,
    "expected zero-based regression to fail",
  );
  assert.throws(
    () =>
      assertTurnMonotonicity([
        { seq: -1, turnJson: { deltas: [] } },
      ]),
    /TURN_INDEX_NEGATIVE/,
    "expected negative turn index to fail",
  );
  assert.throws(
    () =>
      assertTurnMonotonicity([
        { seq: 1, turnJson: { deltas: [] } },
        { seq: 1, turnJson: { deltas: [] } },
      ]),
    /TURN_INDEX_NOT_STRICTLY_INCREASING/,
    "expected duplicate turn index to fail",
  );

  const resolutionSuccess = resolveRoll2d6(fixedRng([0.5, 0.9]));
  const resolutionCost = resolveRoll2d6(fixedRng([0.35, 0.5]));
  const resolutionFail = resolveRoll2d6(fixedRng([0, 0]));
  const toOutcomeBand = (tier: "fail" | "cost" | "hit" | "crit") =>
    tier === "fail" ? "fail-forward" : tier === "cost" ? "success-with-cost" : "success";
  assert.equal(resolutionSuccess.total, 10, "expected deterministic 2d6 success total");
  assert.equal(resolutionCost.total, 7, "expected deterministic 2d6 cost total");
  assert.equal(resolutionFail.total, 2, "expected deterministic 2d6 fail total");
  assert.equal(toOutcomeBand(tierFor2d6(resolutionSuccess.total)), "success", "expected 10-12 success band");
  assert.equal(
    toOutcomeBand(tierFor2d6(resolutionCost.total)),
    "success-with-cost",
    "expected 7-9 success-with-cost band",
  );
  assert.equal(toOutcomeBand(tierFor2d6(resolutionFail.total)), "fail-forward", "expected 2-6 fail-forward band");

  const failForwardEvents = [
    {
      seq: 0,
      turnJson: {
        deltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ id: "ledger_failforward_0", turnIndex: 0 }],
      },
    },
    {
      seq: 1,
      turnJson: {
        resolution: { tier: "fail" },
        deltas: [{ op: "flag.set", key: "failed_once", value: true }],
        ledgerAdds: [{ id: "ledger_failforward_1", turnIndex: 1 }],
      },
    },
    {
      seq: 2,
      turnJson: {
        deltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ id: "ledger_followup_2", turnIndex: 2 }],
      },
    },
  ];
  const failForwardState = replayStateFromTurnJson(failForwardEvents);
  assert(failForwardState !== undefined && failForwardState !== null, "expected non-empty replay state after fail-forward");
  assert.equal((failForwardState as any)?.world?.flags?.failed_once, true, "expected fail-forward state mutation");
  const failForwardBundle = {
    bundleId: "bundle-fail-forward",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    turns: failForwardEvents.map((event) => ({
      turnIndex: event.seq,
      resolution: event.turnJson.resolution,
      stateDeltas: event.turnJson.deltas,
      ledgerAdds: event.turnJson.ledgerAdds,
    })),
  };
  const failForwardReplay = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=fail-forward-bundle",
      "--manifest-json",
      `--bundle-json=${JSON.stringify(failForwardBundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    failForwardReplay.status,
    0,
    `fail-forward replay failed: ${failForwardReplay.stderr || failForwardReplay.stdout}`,
  );
  const failForwardOut = failForwardReplay.stdout ?? "";
  assert(failForwardOut.includes("TURNS 3"), "expected fail-forward fixture to increment turn count");
  assert(
    failForwardOut.includes("FAIL_FORWARD_SIGNAL: FLAG_SET"),
    "expected fail-forward signal classification marker",
  );
  assert(failForwardOut.includes("FAIL_FORWARD_CHECK: PASS"), "expected fail-forward check pass output");
  const failForwardManifestLine =
    failForwardOut.split(/\r?\n/).find((line) => line.startsWith("SUPPORT_MANIFEST_JSON ")) ?? "";
  assert(failForwardManifestLine.length > 0, "expected fail-forward manifest output");
  const failForwardManifestJson = JSON.parse(failForwardManifestLine.replace(/^SUPPORT_MANIFEST_JSON\s+/, ""));
  const failForwardRow = Array.isArray(failForwardManifestJson.perTurn)
    ? failForwardManifestJson.perTurn.find((row: any) => row?.turnIndex === 1)
    : null;
  assert(failForwardRow && failForwardRow.deltaCount > 0, "expected fail-forward turn to include state delta");
  assert(failForwardRow && failForwardRow.ledgerCount > 0, "expected fail-forward turn to include ledger entries");
  assert(failForwardRow && failForwardRow.hasResolution === true, "expected fail-forward turn to include resolution marker");

  const failForwardViolationBundle = {
    bundleId: "bundle-fail-forward-violation",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ id: "ledger_ffv_0", turnIndex: 0 }],
      },
      {
        turnIndex: 1,
        resolution: { tier: "fail" },
        stateDeltas: [],
        ledgerAdds: [],
      },
    ],
  };
  const failForwardViolationReplay = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=fail-forward-violation",
      `--bundle-json=${JSON.stringify(failForwardViolationBundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(failForwardViolationReplay.status, 1, "expected fail-forward violation replay to fail");
  assert(
    (failForwardViolationReplay.stderr ?? "").includes("FAIL_FORWARD_VIOLATION"),
    "expected fail-forward violation marker in stderr",
  );
  assert(
    (failForwardViolationReplay.stdout ?? "").includes("FAIL_FORWARD_CHECK: FAIL"),
    "expected fail-forward check fail output",
  );
  assert.throws(
    () =>
      replayStateFromTurnJson(
        [
          {
            seq: 0,
            turnJson: {
              deltas: [{ op: "flag.set", key: "k", value: true, path: "engine.meta.k" }],
              ledgerAdds: [{ id: "ledger_namespace_0", turnIndex: 0 }],
            },
          },
        ],
      ),
    /DELTA_NAMESPACE_NOT_ALLOWED/,
    "expected namespace guard to reject out-of-namespace delta paths",
  );
  assert.throws(
    () =>
      replayStateFromTurnJson(
        [{ seq: 0, turnJson: { kind: "GENESIS" } }],
        { rogue: true } as any,
      ),
    /REPLAY_STATE_TOP_KEY_NOT_ALLOWED/,
    "expected top-level state namespace lock to reject rogue keys",
  );
  assert.throws(
    () =>
      replayStateFromTurnJson([
        {
          seq: 0,
          turnJson: {
            deltas: [
              { op: "flag.set", key: "quest_seen", value: true, path: "quests.seen" },
              { op: "flag.set", key: "alpha", value: true, path: "flags.alpha" },
            ],
            ledgerAdds: [{ id: "ledger_order_0", turnIndex: 0 }],
          },
        },
      ]),
    /DELTA_ORDER_NOT_SORTED/,
    "expected unsorted delta paths to fail ordering lock",
  );
  assert.throws(
    () =>
      replayStateFromTurnJson([
        {
          seq: 0,
          turnJson: {
            deltas: [{ op: "flag.set", key: "dock_seen", value: true, path: "flags.dock_seen" }],
            ledgerAdds: [{ id: "ledger_uuid_like", turnIndex: 0, message: "trace 123e4567-e89b-12d3-a456-426614174000" }],
          },
        },
      ]),
    /LEDGER_TEXT_NON_DETERMINISTIC/,
    "expected non-deterministic ledger text to fail",
  );
  assert.throws(
    () =>
      replayStateFromTurnJson(
        [
          {
            seq: 0,
            turnJson: {
              deltas: [{ op: "flag.set", key: "toneLock", value: "unlocked", path: "flags.toneLock" }],
              ledgerAdds: [{ id: "ledger_style_0", turnIndex: 0 }],
            },
          },
        ],
        {
          stateVersion: "v1",
          world: { time: 0, locationId: "room_start", clocks: {}, flags: { toneLock: "locked" } },
          inventory: {},
          map: { nodes: {} },
          npcs: {},
        } as any,
      ),
    /STYLE_LOCK_VIOLATION/,
    "expected locked style key downgrade to fail",
  );
  let nonIdempotentTick = false;
  assert.throws(
    () =>
      assertDeltaApplyIdempotency({ ok: true }, [], () => {
        nonIdempotentTick = !nonIdempotentTick;
        return { tick: nonIdempotentTick ? 1 : 2 };
      }),
    /DELTA_APPLY_NON_IDEMPOTENT/,
    "expected delta apply idempotency guard to fail on unstable applier",
  );

  const guardSummaryReplay = replayStateFromTurnJsonWithGuardSummary([
    {
      seq: 0,
      turnJson: {
        deltas: [{ op: "flag.set", key: "dockSeen", value: true, path: "flags.dockSeen" }],
        ledgerAdds: [{ id: "ledger_guard_0", turnIndex: 0 }],
      },
    },
  ]);
  assert.deepEqual(
    guardSummaryReplay.guardSummary,
    REPLAY_GUARD_ORDER,
    "expected guard summary names in deterministic order",
  );
  assert.equal(guardSummaryReplay.styleLockPresent, false, "expected no style lock marker when no style lock keys are present");

  const invalidDeltaBundle = {
    bundleId: "bundle-invalid-delta",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "flag.set", path: "", key: "k", value: true }],
        ledgerAdds: [{ id: "ledger_invalid_delta_0", turnIndex: 0 }],
      },
    ],
  };
  const invalidDeltaReplay = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=invalid-delta-bundle",
      `--bundle-json=${JSON.stringify(invalidDeltaBundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(invalidDeltaReplay.status, 1, "expected invalid delta bundle replay to fail");
  assert(
    (invalidDeltaReplay.stderr ?? "").includes("STATE_DELTA_PATH_INVALID"),
    "expected invalid delta bundle failure marker",
  );

  const invalidLedgerBundle = {
    bundleId: "bundle-invalid-ledger",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ id: "ledger_bad_turn_ref", turnIndex: 99 }],
      },
    ],
  };
  const invalidLedgerReplay = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=invalid-ledger-bundle",
      `--bundle-json=${JSON.stringify(invalidLedgerBundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(invalidLedgerReplay.status, 1, "expected invalid ledger bundle replay to fail");
  assert(
    (invalidLedgerReplay.stderr ?? "").includes("LEDGER_REFERENCE_INVALID"),
    "expected invalid ledger bundle failure marker",
  );

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `replay script failed: ${result.stderr || result.stdout}`);

  const out = result.stdout ?? "";
  assert(out.includes("REPLAY COMPLETE"), "expected REPLAY COMPLETE marker");
  assert(out.includes("FAIL_FORWARD_SIGNAL: NONE"), "expected FAIL_FORWARD_SIGNAL NONE marker");
  assert(out.includes("FAIL_FORWARD_CHECK: PASS"), "expected FAIL_FORWARD_CHECK PASS marker");
  assert(out.includes("FINAL_STATE_HASH"), "expected FINAL_STATE_HASH marker");
  assert(out.includes("TURNS"), "expected TURNS marker");
  assert(out.includes("INVARIANT_SEQ_CONTIGUOUS"), "expected sequence invariant marker");
  assert(out.includes("INVARIANT_LEDGER_COUNT"), "expected ledger invariant marker");
  assert(out.includes(`TELEMETRY_VERSION ${TELEMETRY_VERSION}`), "expected TELEMETRY_VERSION marker");
  assert(out.includes("TELEMETRY"), "expected TELEMETRY marker");
  assert(out.includes("TURN_COUNT:"), "expected TURN_COUNT telemetry field");
  assert(out.includes("TOTAL_LEDGER_ENTRIES:"), "expected TOTAL_LEDGER_ENTRIES telemetry field");
  assert(out.includes("TOTAL_STATE_DELTAS:"), "expected TOTAL_STATE_DELTAS telemetry field");
  assert(out.includes("MAX_DELTA_PER_TURN:"), "expected MAX_DELTA_PER_TURN telemetry field");
  assert(out.includes("AVG_DELTA_PER_TURN:"), "expected AVG_DELTA_PER_TURN telemetry field");
  assert(out.includes("MAX_LEDGER_PER_TURN:"), "expected MAX_LEDGER_PER_TURN telemetry field");
  assert(out.includes("FINAL_STATE_HASH:"), "expected telemetry FINAL_STATE_HASH field");
  assert(out.includes("PER_TURN_TELEMETRY"), "expected PER_TURN_TELEMETRY marker");
  assert(
    /TURN_INDEX:\s+\d+\s+DELTA_COUNT:\s+\d+\s+LEDGER_COUNT:\s+\d+\s+HAS_RESOLUTION:\s+(true|false)\s+FAIL_FORWARD_SIGNAL:\s*(STATE_DELTA|QUEST_ADVANCE|FLAG_SET|RELATIONSHIP_SHIFT|SYSTEM_NO_LEDGER)?/.test(
      out,
    ),
    "expected at least one per-turn telemetry row",
  );
  assert(!out.includes("TELEMETRY_JSON "), "did not expect TELEMETRY_JSON without flag");
  assert(out.includes("MANIFEST_HASH "), "expected MANIFEST_HASH output in base run");

  const telemetryBlockA = extractSection(out, "TELEMETRY", "PER_TURN_TELEMETRY");
  const perTurnBlockA = extractSection(out, "PER_TURN_TELEMETRY");
  const hashLineA = (out.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();

  const telemetryValues: Record<string, number> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(
      /^(TURN_COUNT|TOTAL_LEDGER_ENTRIES|TOTAL_STATE_DELTAS|MAX_DELTA_PER_TURN|AVG_DELTA_PER_TURN|MAX_LEDGER_PER_TURN):\s+([0-9]+(?:\.[0-9]+)?)$/,
    );
    if (m) {
      telemetryValues[m[1]] = Number(m[2]);
    }
  }

  const positiveFields = [
    "TURN_COUNT",
    "TOTAL_LEDGER_ENTRIES",
    "TOTAL_STATE_DELTAS",
    "MAX_DELTA_PER_TURN",
    "AVG_DELTA_PER_TURN",
    "MAX_LEDGER_PER_TURN",
  ] as const;

  for (const field of positiveFields) {
    const value = telemetryValues[field];
    assert(Number.isFinite(value) && value > 0, `expected ${field} > 0, got ${String(value)}`);
  }

  const result2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result2.status, 0, `second replay script failed: ${result2.stderr || result2.stdout}`);
  const out2 = result2.stdout ?? "";
  const telemetryBlockB = extractSection(out2, "TELEMETRY", "PER_TURN_TELEMETRY");
  const perTurnBlockB = extractSection(out2, "PER_TURN_TELEMETRY");
  const hashLineB = (out2.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();

  assert.equal(telemetryBlockA, telemetryBlockB, "telemetry block should be stable across runs");
  assert.equal(perTurnBlockA, perTurnBlockB, "per-turn telemetry should be stable across runs");
  assert.equal(hashLineA, hashLineB, "final state hash should be stable across runs");

  const withJson = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--telemetry-json",
      "--manifest-json",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(withJson.status, 0, `replay script (--telemetry-json) failed: ${withJson.stderr || withJson.stdout}`);
  const outJson = withJson.stdout ?? "";
  assert(outJson.includes("TELEMETRY_JSON "), "expected TELEMETRY_JSON output when flag is present");
  assert(outJson.includes("SUPPORT_MANIFEST_JSON "), "expected SUPPORT_MANIFEST_JSON output when flag is present");
  assert(outJson.includes("MANIFEST_HASH "), "expected MANIFEST_HASH output when flag is present");
  const telemetryJsonLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("TELEMETRY_JSON ")) ?? "";
  assert(telemetryJsonLine.length > 0, "expected TELEMETRY_JSON line");
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|token|random|seed|Date\.now|performance\.now/i.test(telemetryJsonLine),
    "telemetry JSON should not include timing/entropy fields",
  );

  const baseHashLine = (out.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();
  const baseHash = baseHashLine.split(" ")[1] ?? "";
  const manifestLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("SUPPORT_MANIFEST_JSON ")) ?? "";
  assert(manifestLine.length > 0, "expected SUPPORT_MANIFEST_JSON line");
  const manifestJsonRaw = manifestLine.replace(/^SUPPORT_MANIFEST_JSON\s+/, "");
  const manifestHashLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("MANIFEST_HASH ")) ?? "";
  assert(manifestHashLine.length > 0, "expected MANIFEST_HASH line");
  const manifestHash = manifestHashLine.replace(/^MANIFEST_HASH\s+/, "").trim();
  const expectedManifestHash = crypto.createHash("sha256").update(manifestJsonRaw).digest("hex");
  assert.equal(manifestHash, expectedManifestHash, "manifest hash should match sha256(manifest json)");

  const manifestJson = JSON.parse(manifestJsonRaw);
  assert.equal(
    manifestJson.manifestVersion,
    SUPPORT_MANIFEST_VERSION,
    "manifestVersion should match SUPPORT_MANIFEST_VERSION",
  );
  assert.equal(
    manifestJson.replay?.telemetryVersion,
    TELEMETRY_VERSION,
    "replay.telemetryVersion should match TELEMETRY_VERSION",
  );
  assert.equal(
    manifestJson.perTurn?.length,
    manifestJson.replay?.turnCount,
    "manifest perTurn length should match replay.turnCount",
  );
  assert.equal(
    manifestJson.replay?.finalStateHash,
    baseHash,
    "manifest replay.finalStateHash should match base FINAL_STATE_HASH",
  );
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|token|random|seed|Date\.now|performance\.now/i.test(manifestJsonRaw),
    "manifest json should not include timing/entropy fields",
  );

  const orderedKeys = [
    "\"manifestVersion\"",
    "\"bundleId\"",
    "\"engineVersion\"",
    "\"scenarioContentHash\"",
    "\"adventureId\"",
    "\"buildVersion\"",
    "\"replay\"",
    "\"telemetry\"",
    "\"perTurn\"",
  ];
  const keyPositions = orderedKeys.map((key) => manifestJsonRaw.indexOf(key));
  for (let i = 0; i < keyPositions.length - 1; i++) {
    assert(
      keyPositions[i] >= 0 && keyPositions[i + 1] >= 0 && keyPositions[i] < keyPositions[i + 1],
      `expected manifest key order for ${orderedKeys[i]} before ${orderedKeys[i + 1]}`,
    );
  }

  const withManifest2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    withManifest2.status,
    0,
    `second replay script (--manifest-json) failed: ${withManifest2.stderr || withManifest2.stdout}`,
  );
  const manifestLine2 =
    (withManifest2.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("SUPPORT_MANIFEST_JSON ")) ?? "";
  assert(manifestLine2.length > 0, "expected SUPPORT_MANIFEST_JSON line in second manifest run");
  assert.equal(manifestLine, manifestLine2, "manifest json output should be stable across runs");
  const manifestHashLine2 =
    (withManifest2.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("MANIFEST_HASH ")) ?? "";
  assert(manifestHashLine2.length > 0, "expected MANIFEST_HASH line in second manifest run");
  assert.equal(manifestHashLine, manifestHashLine2, "manifest hash output should be stable across runs");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-support-package-"));
  const bundlePath = path.join(tempDir, "bundle.json");
  const supportOutDir = path.join(tempDir, "support-out");
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), "utf8");

  const buildSupportPackage = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      buildSupportPackageScriptPath,
      `--bundle-path=${bundlePath}`,
      `--out-dir=${supportOutDir}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    buildSupportPackage.status,
    0,
    `build-support-package failed: ${buildSupportPackage.stderr || buildSupportPackage.stdout}`,
  );
  const supportPackagePathLine =
    (buildSupportPackage.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("SUPPORT_PACKAGE_PATH ")) ?? "";
  assert(supportPackagePathLine.length > 0, "expected SUPPORT_PACKAGE_PATH from package builder");
  const supportPackagePath = supportPackagePathLine.replace(/^SUPPORT_PACKAGE_PATH\s+/, "").trim();
  assert(fs.existsSync(supportPackagePath), "expected support package file to exist");
  const supportPackageBytes = fs.readFileSync(supportPackagePath);
  const expectedSupportPackSourceHash = crypto.createHash("sha256").update(supportPackageBytes).digest("hex");
  const supportPackageJson = JSON.parse(supportPackageBytes.toString("utf8"));

  const replaySupportPackage = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackagePath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackage.status,
    0,
    `replay script (--support-package-path) failed: ${replaySupportPackage.stderr || replaySupportPackage.stdout}`,
  );
  const outSupportPackage = replaySupportPackage.stdout ?? "";
  assert(outSupportPackage.includes("REPRO_PACK_VALIDATION"), "expected support package validation marker");
  assert(
    outSupportPackage.includes(`PACKAGE_VERSION: ${SUPPORT_PACKAGE_VERSION}`),
    "expected package version validation line",
  );
  assert(outSupportPackage.includes("MANIFEST_HASH_MATCH: true"), "expected manifest hash parity");
  assert(outSupportPackage.includes("FINAL_STATE_HASH_MATCH: true"), "expected final state hash parity");
  assert(outSupportPackage.includes("TELEMETRY_MATCH: true"), "expected telemetry parity");
  assert(outSupportPackage.includes("DRIFT_SEVERITY: NONE"), "expected deterministic drift severity");
  assert(!outSupportPackage.includes("DRIFT_PARITY_MISMATCH"), "did not expect drift parity mismatch");
  const sourceHashLine =
    outSupportPackage.split(/\r?\n/).find((line) => line.startsWith("REPRO_PACK_SOURCE_HASH ")) ?? "";
  assert(sourceHashLine.length > 0, "expected REPRO_PACK_SOURCE_HASH line");
  assert.equal(
    sourceHashLine.replace(/^REPRO_PACK_SOURCE_HASH\s+/, "").trim(),
    expectedSupportPackSourceHash,
    "expected REPRO_PACK_SOURCE_HASH to match package file hash",
  );
  const summarySection = extractSection(outSupportPackage, "REPRO_PACK_SUMMARY");
  for (const expectedLine of [
    "PACKAGE_VERSION:",
    "MANIFEST_VERSION:",
    "MANIFEST_HASH:",
    "FINAL_STATE_HASH:",
    "DRIFT_SEVERITY:",
  ]) {
    assert(summarySection.includes(expectedLine), `expected summary line: ${expectedLine}`);
  }
  const summaryOrder = [
    "REPRO_PACK_SUMMARY",
    "PACKAGE_VERSION:",
    "MANIFEST_VERSION:",
    "MANIFEST_HASH:",
    "FINAL_STATE_HASH:",
    "DRIFT_SEVERITY:",
  ];
  const summaryPositions = summaryOrder.map((line) => summarySection.indexOf(line));
  for (let i = 0; i < summaryPositions.length - 1; i++) {
    assert(
      summaryPositions[i] >= 0 && summaryPositions[i + 1] >= 0 && summaryPositions[i] < summaryPositions[i + 1],
      `expected deterministic summary order for ${summaryOrder[i]} before ${summaryOrder[i + 1]}`,
    );
  }

  const supportLines = outSupportPackage.split(/\r?\n/);
  const idxTelemetryVersion = supportLines.findIndex((line) => line.startsWith("TELEMETRY_VERSION "));
  const idxTelemetry = supportLines.findIndex((line) => line.trim() === "TELEMETRY");
  const idxPerTurn = supportLines.findIndex((line) => line.trim() === "PER_TURN_TELEMETRY");
  const idxManifestJson = supportLines.findIndex((line) => line.startsWith("SUPPORT_MANIFEST_JSON "));
  const idxManifestHash = supportLines.findIndex((line) => line.startsWith("MANIFEST_HASH "));
  const idxPackSourceHash = supportLines.findIndex((line) => line.startsWith("REPRO_PACK_SOURCE_HASH "));
  const idxPackValidation = supportLines.findIndex((line) => line.trim() === "REPRO_PACK_VALIDATION");
  const idxPackSummary = supportLines.findIndex((line) => line.trim() === "REPRO_PACK_SUMMARY");
  assert(
    idxTelemetryVersion >= 0 &&
      idxTelemetry >= 0 &&
      idxPerTurn >= 0 &&
      idxManifestJson >= 0 &&
      idxManifestHash >= 0 &&
      idxPackSourceHash >= 0 &&
      idxPackValidation >= 0 &&
      idxPackSummary >= 0,
    "expected ordered output markers in support package replay mode",
  );
  assert(
    idxTelemetryVersion < idxTelemetry &&
      idxTelemetry < idxPerTurn &&
      idxPerTurn < idxManifestJson &&
      idxManifestJson < idxManifestHash &&
      idxManifestHash < idxPackSourceHash &&
      idxPackSourceHash < idxPackValidation &&
      idxPackValidation < idxPackSummary,
    "expected deterministic output section ordering",
  );
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|random|seed|Date\.now|performance\.now/i.test(outSupportPackage),
    "support package replay output should not include entropy/timing tokens",
  );

  const replaySupportPackage2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackagePath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackage2.status,
    0,
    `second replay script (--support-package-path) failed: ${replaySupportPackage2.stderr || replaySupportPackage2.stdout}`,
  );
  const outSupportPackage2 = replaySupportPackage2.stdout ?? "";
  assert.equal(outSupportPackage, outSupportPackage2, "support package replay output should be byte-stable across runs");

  const supportPackageWithoutDriftPath = path.join(tempDir, "support-package-without-drift.json");
  const supportPackageWithoutDrift = JSON.parse(JSON.stringify(supportPackageJson));
  delete supportPackageWithoutDrift.drift;
  fs.writeFileSync(supportPackageWithoutDriftPath, JSON.stringify(supportPackageWithoutDrift), "utf8");

  const replaySupportPackageMissingDrift = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackageWithoutDriftPath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackageMissingDrift.status,
    0,
    `replay script (missing drift block) failed: ${replaySupportPackageMissingDrift.stderr || replaySupportPackageMissingDrift.stdout}`,
  );
  const outMissingDrift = replaySupportPackageMissingDrift.stdout ?? "";
  assert(outMissingDrift.includes("DRIFT_BLOCK_MISSING"), "expected DRIFT_BLOCK_MISSING warning");

  const supportPackageCorruptedPath = path.join(tempDir, "support-package-corrupted.json");
  const supportPackageCorrupted = JSON.parse(JSON.stringify(supportPackageJson));
  supportPackageCorrupted.manifestHash = "deadbeef";
  fs.writeFileSync(supportPackageCorruptedPath, JSON.stringify(supportPackageCorrupted), "utf8");

  const replaySupportPackageCorrupted = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackageCorruptedPath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackageCorrupted.status,
    1,
    `expected replay script to exit 1 for corrupted support package, got ${String(replaySupportPackageCorrupted.status)}`,
  );
  const outCorrupted = replaySupportPackageCorrupted.stdout ?? "";
  assert(outCorrupted.includes("MANIFEST_HASH_MATCH: false"), "expected manifest hash mismatch in corrupted replay");
  assert(
    (replaySupportPackageCorrupted.stderr ?? "").includes("REPRO_PACK_VALIDATION_FAILED"),
    "expected deterministic failure marker for corrupted support package replay",
  );

  const corruptedManifest = JSON.parse(JSON.stringify(manifestJson));
  corruptedManifest.perTurn = [];
  assert.throws(
    () => assertSupportManifestConsistency(corruptedManifest),
    /SUPPORT_MANIFEST_INTEGRITY_ERROR/,
    "expected manifest consistency guard to throw on corrupted manifest",
  );

  console.log("REPLAY FROM BUNDLE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
