"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowUpRightIcon, SearchIcon } from "@/components/planner/icons";

export type HomeSearchItem = {
  label: string;
  description: string;
  href: string;
  keywords?: readonly string[];
};

function normalizeSearchText(value: string)
{
  return value.trim().toLowerCase();
}

function getSearchText(item: HomeSearchItem)
{
  return [
    item.label,
    item.description,
    ...(item.keywords ?? []),
  ].join(" ").toLowerCase();
}

export function HomeSearch({
  items,
}: {
  items: readonly HomeSearchItem[];
})
{
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearchText(query);

  const matches = useMemo(() => {
    if (!normalizedQuery)
    {
      return items.slice(0, 6);
    }

    return items
      .map((item) => {
        const searchText = getSearchText(item);
        const label = item.label.toLowerCase();
        const score = label === normalizedQuery
          ? 0
          : label.startsWith(normalizedQuery)
            ? 1
            : searchText.includes(normalizedQuery)
              ? 2
              : 9;

        return { item, score };
      })
      .filter(({ score }) => score < 9)
      .sort((left, right) => left.score - right.score || left.item.label.localeCompare(right.item.label))
      .slice(0, 6)
      .map(({ item }) => item);
  }, [items, normalizedQuery]);

  function openItem(item: HomeSearchItem)
  {
    if (item.href.startsWith("/"))
    {
      router.push(item.href);
      return;
    }

    window.location.assign(item.href);
  }

  return (
    <div className="w-full max-w-3xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim();
          const bestMatch = matches[0];

          if (trimmed && bestMatch)
          {
            openItem(bestMatch);
            return;
          }

          router.push(trimmed ? `/courses?q=${encodeURIComponent(trimmed)}` : "/courses");
        }}
        className="relative"
      >
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--on-surface-variant)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages, actions, courses, or useful links"
          className="w-full rounded-[1rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-4 pl-12 pr-4 text-[15px] font-medium leading-5 text-[var(--on-surface)] shadow-sm outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]"
        />
      </form>

      {matches.length > 0 ? (
        <div className="mt-3 grid gap-2" aria-label="Search suggestions">
          {matches.map((item) => {
            const isExternal = !item.href.startsWith("/");

            return (
              <button
                key={`${item.label}-${item.href}`}
                type="button"
                onClick={() => openItem(item)}
                className="group flex min-h-[3.75rem] w-full items-center justify-between gap-3 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold leading-5 text-[var(--on-surface)] group-hover:text-[var(--primary)]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    {item.description}
                  </span>
                </span>
                {isExternal ? (
                  <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
