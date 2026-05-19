const { spawnSync } = require("node:child_process");

const nextBin = require.resolve("next/dist/bin/next");
const extraArgs = process.argv.slice(2);
const args = [nextBin, "build", "--webpack", ...extraArgs];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TEST_WASM: "1",
  },
});

process.exit(result.status ?? 1);
