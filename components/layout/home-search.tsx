"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";

import { ArrowUpRightIcon, SearchIcon } from "@/components/planner/icons";

export type HomeSearchItem = {
  label: string;
  description: string;
  href: string;
  keywords?: readonly string[];
};

type HomeSearchDocument = {
  item: HomeSearchItem;
  label: string;
  compactLabel: string;
  description: string;
  keywords: string[];
  compactText: string;
};

function normalizeSearchText(value: string)
{
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function compactSearchText(value: string)
{
  return normalizeSearchText(value).replace(/\s/g, "");
}

function getSearchDocument(item: HomeSearchItem): HomeSearchDocument
{
  const searchText = [
    item.label,
    item.description,
    ...(item.keywords ?? []),
  ].join(" ");

  return {
    item,
    label: normalizeSearchText(item.label),
    compactLabel: compactSearchText(item.label),
    description: normalizeSearchText(item.description),
    keywords: (item.keywords ?? []).map(normalizeSearchText),
    compactText: compactSearchText(searchText),
  };
}

function isInternalLink(href: string)
{
  return href.startsWith("/");
}

function isMailLink(href: string)
{
  return href.startsWith("mailto:");
}

export function HomeSearch({
  items,
}: {
  items: readonly HomeSearchItem[];
})
{
  const router = useRouter();
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const searchDocuments = useMemo(() => items.map(getSearchDocument), [items]);
  const fuse = useMemo(() => new Fuse(searchDocuments, {
    distance: 180,
    findAllMatches: true,
    ignoreLocation: true,
    ignoreFieldNorm: true,
    includeScore: true,
    keys: [
      { name: "label", weight: 0.45 },
      { name: "compactLabel", weight: 0.25 },
      { name: "keywords", weight: 0.15 },
      { name: "description", weight: 0.1 },
      { name: "compactText", weight: 0.05 },
    ],
    threshold: 0.48,
  }), [searchDocuments]);

  const matches = useMemo(() => {
    if (!normalizedQuery)
    {
      return items.slice(0, 6);
    }

    const rankedItems = new Map<string, { item: HomeSearchItem; score: number }>();
    const queries = compactQuery && compactQuery !== normalizedQuery
      ? [normalizedQuery, compactQuery]
      : [normalizedQuery];

    for (const fuseQuery of queries)
    {
      for (const result of fuse.search(fuseQuery))
      {
        const key = result.item.item.href;
        const score = result.score ?? 1;
        const existingResult = rankedItems.get(key);

        if (!existingResult || score < existingResult.score)
        {
          rankedItems.set(key, {
            item: result.item.item,
            score,
          });
        }
      }
    }

    return [...rankedItems.values()]
      .sort((left, right) => left.score - right.score || left.item.label.localeCompare(right.item.label))
      .slice(0, 6)
      .map(({ item }) => item);
  }, [compactQuery, fuse, items, normalizedQuery]);
  const courseSearchItem = trimmedQuery
    ? {
      label: `Search courses for "${trimmedQuery}"`,
      description: "Search course codes, names, schools, and synopses.",
      href: `/courses?q=${encodeURIComponent(trimmedQuery)}`,
    } satisfies HomeSearchItem
    : null;
  const visibleItems = courseSearchItem
    ? [...matches.slice(0, 5), courseSearchItem]
    : matches;

  function openItem(item: HomeSearchItem)
  {
    if (isInternalLink(item.href))
    {
      router.push(item.href);
      return;
    }

    if (isMailLink(item.href))
    {
      window.location.assign(item.href);
      return;
    }

    window.open(item.href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const bestMatch = matches[0];

          if (trimmedQuery && bestMatch)
          {
            openItem(bestMatch);
            return;
          }

          router.push(courseSearchItem?.href ?? "/courses");
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

      {visibleItems.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Search suggestions">
          {visibleItems.map((item) => {
            const isExternal = !isInternalLink(item.href);
            const isCourseSearchSuggestion = courseSearchItem?.href === item.href;

            return (
              <button
                key={`${item.label}-${item.href}`}
                type="button"
                onClick={() => openItem(item)}
                className="group flex min-h-[5.25rem] w-full items-start justify-between gap-3 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold leading-5 text-[var(--on-surface)] group-hover:text-[var(--primary)]">
                    {item.label}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    {item.description}
                  </span>
                </span>
                {isExternal ? (
                  <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]" />
                ) : isCourseSearchSuggestion ? (
                  <SearchIcon className="h-4 w-4 shrink-0 text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
