export const SNAPSHOT_RESPONSE_CACHE_CONTROL = "public, max-age=0, s-maxage=31536000";

export function getSnapshotCacheHeaders()
{
  return {
    "Cache-Control": SNAPSHOT_RESPONSE_CACHE_CONTROL,
  };
}
