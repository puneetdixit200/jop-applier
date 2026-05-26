export type ProfileResume = {
  fileName: string;
  path: string;
  content: string;
  updatedAt: string;
};

export function profileResumeFromPreferences(preferences: unknown): ProfileResume {
  const resume = isRecord(preferences) && isRecord(preferences.resume)
    ? preferences.resume
    : {};

  return {
    fileName: textField(resume.fileName),
    path: textField(resume.path),
    content: textField(resume.content),
    updatedAt: textField(resume.updatedAt),
  };
}

export function preferencesWithProfileResume(
  basePreferences: Record<string, unknown>,
  resume: ProfileResume,
): Record<string, unknown> {
  const preferences = { ...basePreferences };
  const fileName = resume.fileName.trim();
  const path = resume.path.trim();
  const content = resume.content.trim();
  const updatedAt = resume.updatedAt.trim();

  if (fileName || path || content) {
    preferences.resume = {
      ...(fileName ? { fileName } : {}),
      ...(path ? { path } : {}),
      ...(content ? { content } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  } else {
    delete preferences.resume;
  }

  return preferences;
}

function textField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
