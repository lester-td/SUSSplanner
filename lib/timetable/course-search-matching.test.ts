import { describe, expect, it } from "vitest";

import {
  courseMatchesSearchQuery,
  getCourseSearchRank,
  getCourseSearchTerms,
  type SearchableCourseRecord,
} from "./course-search-matching";

const ict133: SearchableCourseRecord = {
  courseCode: "ICT133",
  courseName: "Structured Programming",
  schoolName: "School of Science and Technology",
  courseSynopsis: "This course introduces programming fundamentals.",
};

function course(overrides: Partial<SearchableCourseRecord>): SearchableCourseRecord
{
  return {
    courseCode: "ABC101",
    courseName: "Untitled Course",
    schoolName: "School",
    courseSynopsis: "",
    ...overrides,
  };
}

describe("course search matching", () => {
  it("normalizes a query into individual search terms", () => {
    expect(getCourseSearchTerms("  ICT133, Structured Programming  "))
      .toEqual(["ict133", "structured", "programming"]);
  });

  it("matches terms across course code and course title", () => {
    expect(courseMatchesSearchQuery(ict133, "ict133 structured")).toBe(true);
    expect(courseMatchesSearchQuery(ict133, "structured ict133")).toBe(true);
  });

  it("requires every query term to match at least one field", () => {
    expect(courseMatchesSearchQuery(ict133, "ict133 databases")).toBe(false);
  });

  it("keeps fuzzy matching for individual terms", () => {
    expect(courseMatchesSearchQuery(ict133, "ict133 strctured")).toBe(true);
  });

  it("ranks course code matches above title matches", () => {
    const titleOnlyMatch = course({
      courseName: "ICT133 Structured Concepts",
    });

    expect(getCourseSearchRank(ict133, "ict133 structured"))
      .toBeLessThan(getCourseSearchRank(titleOnlyMatch, "ict133 structured"));
  });

  it("ranks title matches above synopsis matches", () => {
    const titleMatch = course({
      courseName: "Structured Programming",
      courseSynopsis: "Other details.",
    });
    const synopsisMatch = course({
      courseName: "Programming Foundations",
      courseSynopsis: "Structured design and implementation.",
    });

    expect(getCourseSearchRank(titleMatch, "structured"))
      .toBeLessThan(getCourseSearchRank(synopsisMatch, "structured"));
  });
});
