"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";

import { ArrowUpRightIcon, SearchIcon } from "@/components/planner/icons";

export type HomeSearchItem = {
  label: string;
  description: string;
  href: string;
  keywords?: readonly string[];
};

type CourseSearchApiResult = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  creditUnits: number | null;
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
  placeholder = "Search pages, actions, courses, or useful links",
  prominent = false,
  showSuggestionsOnEmpty = true,
}: {
  items: readonly HomeSearchItem[];
  placeholder?: string;
  prominent?: boolean;
  showSuggestionsOnEmpty?: boolean;
})
{
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [courseMatches, setCourseMatches] = useState<HomeSearchItem[]>([]);
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
      return showSuggestionsOnEmpty ? items.slice(0, 6) : [];
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
  }, [compactQuery, fuse, items, normalizedQuery, showSuggestionsOnEmpty]);

  useEffect(() => {
    if (trimmedQuery.length < 2)
    {
      setCourseMatches([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const requestQuery = new URLSearchParams({ q: trimmedQuery });

      fetch(`/api/courses/search?${requestQuery}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok)
          {
            throw new Error("Unable to search courses.");
          }

          return response.json() as Promise<{ courses: CourseSearchApiResult[] }>;
        })
        .then((payload) => {
          setCourseMatches(payload.courses.slice(0, 3).map((course) => ({
            label: course.courseName
              ? `${course.courseCode} — ${course.courseName}`
              : course.courseCode,
            description: [
              course.schoolName,
              course.creditUnits === null ? null : `${course.creditUnits} CU`,
            ].filter(Boolean).join(" · ") || "View course details.",
            href: `/courses/${encodeURIComponent(course.courseCode)}`,
            keywords: ["course", "module", course.courseCode, course.courseName ?? ""],
          })));
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError"))
          {
            setCourseMatches([]);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedQuery]);

  const combinedMatches = useMemo(() => {
    const itemsByHref = new Map<string, HomeSearchItem>();

    for (const item of [...matches, ...courseMatches])
    {
      if (!itemsByHref.has(item.href))
      {
        itemsByHref.set(item.href, item);
      }
    }

    return [...itemsByHref.values()];
  }, [courseMatches, matches]);
  const courseSearchItem = trimmedQuery
    ? {
      label: `View all course results for "${trimmedQuery}"`,
      description: "Open the complete course search with this query.",
      href: `/courses?q=${encodeURIComponent(trimmedQuery)}`,
    } satisfies HomeSearchItem
    : null;
  const visibleItems = courseSearchItem
    ? [...combinedMatches.slice(0, 5), courseSearchItem]
    : combinedMatches.slice(0, 6);

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
    <div className="relative z-20 w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const bestMatch = combinedMatches[0];

          if (trimmedQuery && bestMatch)
          {
            openItem(bestMatch);
            return;
          }

          router.push(courseSearchItem?.href ?? "/courses");
        }}
        className="relative"
      >
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)] sm:left-4 sm:h-5 sm:w-5" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-[0.75rem] border bg-[var(--surface-container-lowest)] pl-9 pr-3 font-medium text-[var(--on-surface)] outline-none transition placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-ring-soft)] sm:rounded-[1rem] sm:pl-12 sm:pr-4 ${
            prominent
              ? "border-[var(--brand-divider)] py-3 text-[14px] leading-5 shadow-[0_8px_20px_rgba(15,23,42,0.1)] sm:py-5 sm:text-[17px] sm:leading-6 sm:shadow-[0_10px_28px_rgba(15,23,42,0.12)]"
              : "border-[var(--outline-variant)] py-3 text-[14px] leading-5 shadow-sm sm:py-4 sm:text-[15px]"
          }`}
        />
      </form>

      {visibleItems.length > 0 ? (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-[var(--shadow-elev-3)]"
          aria-label="Search suggestions"
        >
          {visibleItems.map((item) => {
            const isExternal = !isInternalLink(item.href);
            const isCourseSearchSuggestion = courseSearchItem?.href === item.href;

            return (
              <button
                key={`${item.label}-${item.href}`}
                type="button"
                onClick={() => openItem(item)}
                className="group flex min-h-[3.5rem] w-full items-start justify-between gap-2.5 border-b border-[var(--outline-variant)] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--surface-container-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary-ring-soft)] sm:min-h-[4.25rem] sm:gap-3 sm:px-4 sm:py-3"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-5 text-[var(--on-surface)] group-hover:text-[var(--primary)] sm:text-[14px]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[var(--on-surface-variant)] sm:mt-1 sm:text-[12px] sm:leading-5">
                    {item.description}
                  </span>
                </span>
                {isExternal ? (
                  <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)] group-hover:text-[var(--primary)] sm:h-4 sm:w-4" />
                ) : isCourseSearchSuggestion ? (
                  <SearchIcon className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)] group-hover:text-[var(--primary)] sm:h-4 sm:w-4" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
