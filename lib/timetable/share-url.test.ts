import { describe, expect, it } from "vitest";

import { decodeShareUrlState, encodeShareUrlState } from "./share-url";

describe("share URL encoding", () => {
  it("uses compact identifiers and sorts TG classes before CRN classes", () => {
    expect(encodeShareUrlState({
      semesterId: 3,
      selectedClasses: [
        {
          courseCode: "ICT233",
          scheduleType: "evening",
          groupCodeType: "CRN",
          groupCode: "CRN01",
        },
        {
          courseCode: "ANL303",
          scheduleType: "daytime",
          groupCodeType: "TG",
          groupCode: "TG02",
        },
        {
          courseCode: "ACC202",
          scheduleType: "daytime",
          groupCodeType: "TG",
          groupCode: "TG01",
        },
      ],
    })).toBe("/share?sem=3&classes=ACC202:TG01,ANL303:TG02,ICT233:CRN01");
  });

  it("omits the classes parameter when the timetable is empty", () => {
    expect(encodeShareUrlState({ semesterId: 3, selectedClasses: [] }))
      .toBe("/share?sem=3");
  });

  it("decodes group prefixes into schedule and group-code types", () => {
    expect(decodeShareUrlState(new URLSearchParams(
      "sem=3&classes=ANL303:TG01,ICT233:CRN01",
    ))).toEqual({
      semesterId: 3,
      selectedClasses: [
        {
          courseCode: "ANL303",
          scheduleType: "daytime",
          groupCodeType: "TG",
          groupCode: "TG01",
        },
        {
          courseCode: "ICT233",
          scheduleType: "evening",
          groupCodeType: "CRN",
          groupCode: "CRN01",
        },
      ],
    });
  });

  it("rejects the removed legacy identifier format", () => {
    expect(() => decodeShareUrlState(new URLSearchParams(
      "sem=3&classes=ANL303:daytime:TG:TG01",
    ))).toThrow(/COURSECODE:TG01/);
  });

  it("rejects schedule and group-code combinations that cannot be compacted", () => {
    expect(() => encodeShareUrlState({
      semesterId: 3,
      selectedClasses: [{
        courseCode: "ANL303",
        scheduleType: "evening",
        groupCodeType: "TG",
        groupCode: "TG01",
      }],
    })).toThrow(/daytime TG/);
  });
});
