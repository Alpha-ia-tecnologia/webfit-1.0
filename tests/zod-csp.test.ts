import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/lib/zod-csp";
import { z } from "zod";
import { profileFixture } from "./fixtures";
import { profileSchema } from "../src/types";

test("zod sem eval: jitless ligado, então não testa new Function sob a CSP de produção", () => {
  assert.equal(z.config().jitless, true);
});

test("validação continua igual sem o atalho compilado", () => {
  const profile = profileFixture();
  assert.deepEqual(profileSchema.parse(profile), profileSchema.parse(structuredClone(profile)));
  assert.equal(profileSchema.safeParse({ ...profile, name: 42 }).success, false);
});
