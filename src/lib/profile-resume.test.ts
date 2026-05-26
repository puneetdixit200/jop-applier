import { describe, expect, it } from "vitest";
import {
  preferencesWithProfileResume,
  profileResumeFromPreferences,
} from "./profile-resume";

describe("profile resume preferences", () => {
  it("loads a saved resume reference from profile preferences", () => {
    expect(
      profileResumeFromPreferences({
        remotePreference: "any",
        resume: {
          fileName: "deepak-resume.pdf",
          path: "/Users/deepak/Documents/deepak-resume.pdf",
          content: "Deepak Kudi\nReact Engineer",
          updatedAt: "2026-05-23T15:30:00.000Z",
        },
      }),
    ).toEqual({
      fileName: "deepak-resume.pdf",
      path: "/Users/deepak/Documents/deepak-resume.pdf",
      content: "Deepak Kudi\nReact Engineer",
      updatedAt: "2026-05-23T15:30:00.000Z",
    });
  });

  it("writes and clears resume preferences without dropping other preferences", () => {
    expect(
      preferencesWithProfileResume(
        { remotePreference: "any" },
        {
          fileName: "resume.pdf",
          path: "",
          content: "Edited resume content",
          updatedAt: "2026-05-23T15:30:00.000Z",
        },
      ),
    ).toEqual({
      remotePreference: "any",
      resume: {
        fileName: "resume.pdf",
        content: "Edited resume content",
        updatedAt: "2026-05-23T15:30:00.000Z",
      },
    });

    expect(
      preferencesWithProfileResume(
        { remotePreference: "any", resume: { fileName: "resume.pdf", content: "Resume" } },
        { fileName: "", path: "", content: "", updatedAt: "" },
      ),
    ).toEqual({ remotePreference: "any" });
  });
});
