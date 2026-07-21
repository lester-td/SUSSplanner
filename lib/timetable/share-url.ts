import { sharedClassIdentifierSchema, sharedTimetableStateSchema } from "@/lib/validation/timetable";
import type { SharedClassIdentifier, SharedTimetableState } from "./types";

const compactGroupCodePattern = /^(TG|CRN)(\d{2})$/;
const groupCodeTypeSortOrder = {
  TG: 0,
  CRN: 1,
} as const;

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
  const [courseCode, groupCode, ...extraParts] = value.split(":");
  if (!courseCode || !groupCode || extraParts.length > 0)
  {
    throw new Error("Shared class identifiers must use COURSECODE:TG01 or COURSECODE:CRN01.");
  }

  const groupCodeMatch = groupCode.match(compactGroupCodePattern);
  if (!groupCodeMatch)
  {
    throw new Error("Shared class group codes must use TG or CRN followed by two digits.");
  }

  const groupCodeType = groupCodeMatch[1] as SharedClassIdentifier["groupCodeType"];

  return sharedClassIdentifierSchema.parse({
    courseCode,
    scheduleType: groupCodeType === "TG" ? "daytime" : "evening",
    groupCodeType,
    groupCode,
  });
}

function compactSharedClassIdentifier(classData: SharedClassIdentifier)
{
  const parsed = sharedClassIdentifierSchema.parse(classData);
  const expectedScheduleType = parsed.groupCodeType === "TG" ? "daytime" : "evening";

  if (parsed.scheduleType !== expectedScheduleType || !compactGroupCodePattern.test(parsed.groupCode))
  {
    throw new Error("Only daytime TG and evening CRN classes with two-digit group codes can be shared.");
  }

  if (!parsed.groupCode.startsWith(parsed.groupCodeType))
  {
    throw new Error("The shared class group code does not match its group-code type.");
  }

  return `${parsed.courseCode}:${parsed.groupCode}`;
}

function compareSharedClasses(left: SharedClassIdentifier, right: SharedClassIdentifier)
{
  return groupCodeTypeSortOrder[left.groupCodeType] - groupCodeTypeSortOrder[right.groupCodeType]
    || left.courseCode.localeCompare(right.courseCode)
    || left.groupCode.localeCompare(right.groupCode);
}

export function encodeShareUrlState(state: SharedTimetableState)
{
  const parsed = sharedTimetableStateSchema.parse(state);
  const baseUrl = `/share?sem=${parsed.semesterId}`;

  if (parsed.selectedClasses.length === 0)
  {
    return baseUrl;
  }

  const classes = [...parsed.selectedClasses]
    .sort(compareSharedClasses)
    .map(compactSharedClassIdentifier)
    .join(",");

  return `${baseUrl}&classes=${classes}`;
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
        .map((value) => parseSharedClassIdentifier(value))
    : [];

  return sharedTimetableStateSchema.parse({
    semesterId,
    selectedClasses,
  });
}
