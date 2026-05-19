import { sharedClassIdentifierSchema, sharedTimetableStateSchema } from "@/lib/validation/timetable";
import type { SharedClassIdentifier, SharedTimetableState } from "./types";

function readParam(
  searchParams:
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
  key: string,
)
{
  if (searchParams instanceof URLSearchParams)
  {
    return searchParams.get(key) ?? undefined;
  }

  const value = searchParams[key];
  if (Array.isArray(value))
  {
    return value[0];
  }

  return value;
}

export function buildSharedClassIdentifier(classData: SharedClassIdentifier)
{
  const parsed = sharedClassIdentifierSchema.parse(classData);
  return [
    parsed.courseCode,
    parsed.scheduleType,
    parsed.groupCodeType,
    parsed.groupCode,
  ].join(":");
}

export function parseSharedClassIdentifier(value: string)
{
  const [courseCode, scheduleType, groupCodeType, ...groupCodeParts] = value.split(":");

  return sharedClassIdentifierSchema.parse({
    courseCode,
    scheduleType,
    groupCodeType,
    groupCode: groupCodeParts.join(":"),
  });
}

export function encodeShareUrlState(state: SharedTimetableState)
{
  const parsed = sharedTimetableStateSchema.parse(state);
  const params = new URLSearchParams();
  params.set("sem", String(parsed.semesterId));

  if (parsed.selectedClasses.length > 0)
  {
    params.set(
      "classes",
      parsed.selectedClasses
        .map((selectedClass) => encodeURIComponent(buildSharedClassIdentifier(selectedClass)))
        .join(","),
    );
  }

  return `/share?${params.toString()}`;
}

export function decodeShareUrlState(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
)
{
  const semesterId = readParam(searchParams, "sem");
  const classes = readParam(searchParams, "classes");

  const selectedClasses = classes
    ? classes
        .split(",")
        .filter(Boolean)
        .map((value) => parseSharedClassIdentifier(decodeURIComponent(value)))
    : [];

  return sharedTimetableStateSchema.parse({
    semesterId,
    selectedClasses,
  });
}
