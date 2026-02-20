"use strict";

/**
 * Example module entrypoint for publish + registry chain tests.
 * Deterministic: no time, no randomness, no environment dependencies.
 */

module.exports = {
  moduleName: "example",
  moduleVersion: "0.0.1",
  run(input) {
    return {
      ok: true,
      echo: input ?? null,
    };
  },
};
