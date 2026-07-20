import "server-only";

const jsonPromises = new Map<string, Promise<unknown>>();

export function readCachedJson<T>(cacheKey: string, load: () => Promise<string>): Promise<T>
{
  const existing = jsonPromises.get(cacheKey);
  if (existing)
  {
    return existing as Promise<T>;
  }

  const pending = load()
    .then((content) => JSON.parse(content) as T)
    .catch((error) => {
      jsonPromises.delete(cacheKey);
      throw new Error(
        `Unable to read generated data snapshot ${cacheKey}. Run \`npm run data:build\` before starting the app.`,
        { cause: error },
      );
    });

  jsonPromises.set(cacheKey, pending);
  return pending;
}
