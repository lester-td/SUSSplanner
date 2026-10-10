import path from "node:path";
import { validateSnapshotArtifacts } from "../lib/data/prerequisites/artifact-validation";
validateSnapshotArtifacts(path.resolve(process.argv[2] ?? "data/snapshots"))
  .then(result => console.log(`Validated snapshot format ${result.formatVersion}: ${result.courses} course payloads.`))
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
