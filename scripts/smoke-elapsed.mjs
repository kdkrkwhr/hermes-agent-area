// quick formatTaskElapsed smoke (no browser)
import { formatTaskElapsed } from "../src/agents/Agent.js";

const cases = [
  [null, null],
  [undefined, null],
  [NaN, null],
  [0, "0s"],
  [14, "14s"],
  [59, "59s"],
  [60, "1m"],
  [420, "7m"],
  [3599, "59m"],
  [3600, "1h0m"],
  [4820, "1h20m"],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = formatTaskElapsed(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? "OK" : "FAIL", input, "→", got, "want", want);
}
process.exit(fail ? 1 : 0);
