import { runCli } from "./cli/main";

await runCli(process.argv.slice(2), process.cwd());
