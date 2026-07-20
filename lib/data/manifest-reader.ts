import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readCachedJson } from "./snapshot-cache";
import {
  DATA_SNAPSHOT_FORMAT_VERSION,
  type DataSnapshotManifest,
} from "./snapshot-types";

const snapshotRoot = path.resolve(process.cwd(), "data", "snapshots");

export async function getSnapshotManifest()
{
  const manifest = await readCachedJson<DataSnapshotManifest>(
    "manifest.json",
    () => readFile(path.join(snapshotRoot, "manifest.json"), "utf8"),
  );
  if (manifest.formatVersion !== DATA_SNAPSHOT_FORMAT_VERSION)
  {
    throw new Error(
      `Unsupported data snapshot format ${manifest.formatVersion}; expected ${DATA_SNAPSHOT_FORMAT_VERSION}.`,
    );
  }
  return manifest;
}
