export type FormFieldType = "input" | "textarea" | "select" | "file" | "checkbox" | "radio";

export type DetectedFormField = {
  selector: string;
  label: string;
  fieldType: FormFieldType;
  required?: boolean;
  options?: string[];
};

export type FormFieldMapping = {
  selector: string;
  fieldType: FormFieldType;
  fieldLabel: string;
  value: string | boolean;
  confidence: number;
};

export type ApplicationFormInput = {
  companyName: string;
  jobTitle: string;
  profile: {
    fullName: string;
    email: string;
    phone?: string | null;
    location?: string | null;
  };
  documents: {
    resumePath?: string | null;
    coverLetterPath?: string | null;
  };
  answers?: Record<string, string>;
};

export type ApplicationFormPage = {
  url: () => Promise<string>;
  fields: () => Promise<DetectedFormField[]>;
  fillText: (selector: string, value: string) => Promise<void>;
  selectOption: (selector: string, value: string) => Promise<void>;
  setChecked: (selector: string, checked: boolean) => Promise<void>;
  setFile: (selector: string, path: string) => Promise<void>;
};

export type FormFillerStrategy = {
  readonly platform: string;
  detect: (page: ApplicationFormPage, input: ApplicationFormInput) => Promise<boolean>;
  mapFields: (
    page: ApplicationFormPage,
    input: ApplicationFormInput,
  ) => Promise<FormFieldMapping[]>;
  fill: (page: ApplicationFormPage, mappings: FormFieldMapping[]) => Promise<void>;
};

export type ApplicationFormFillResult = {
  platform: string;
  submissionUrl: string;
  mappedFields: number;
  requiredMissing: string[];
};

export function createDefaultFormFillerStrategies(): FormFillerStrategy[] {
  return [
    createCommonAtsStrategy("greenhouse", (url) => url.includes("greenhouse.io")),
    createCommonAtsStrategy("lever", (url) => url.includes("jobs.lever.co")),
    createCommonAtsStrategy("generic", () => true),
  ];
}

export async function fillApplicationFormWithStrategy(
  page: ApplicationFormPage,
  input: ApplicationFormInput,
  strategies: FormFillerStrategy[] = createDefaultFormFillerStrategies(),
): Promise<ApplicationFormFillResult> {
  const strategy = await selectStrategy(page, input, strategies);
  const fields = await page.fields();
  const mappings = await strategy.mapFields(page, input);

  await strategy.fill(page, mappings);

  return {
    platform: strategy.platform,
    submissionUrl: await page.url(),
    mappedFields: mappings.length,
    requiredMissing: requiredMissingLabels(fields, mappings),
  };
}

function createCommonAtsStrategy(
  platform: string,
  matchesUrl: (normalizedUrl: string) => boolean,
): FormFillerStrategy {
  return {
    platform,
    detect: async (page) => matchesUrl((await page.url()).toLowerCase()),
    mapFields: async (page, input) =>
      (await page.fields()).flatMap((field) => mapCommonField(field, input)),
    fill: fillMappedFields,
  };
}

async function selectStrategy(
  page: ApplicationFormPage,
  input: ApplicationFormInput,
  strategies: FormFillerStrategy[],
): Promise<FormFillerStrategy> {
  for (const strategy of strategies) {
    if (await strategy.detect(page, input)) {
      return strategy;
    }
  }

  throw new Error("No application form filler strategy matched the page");
}

function mapCommonField(
  field: DetectedFormField,
  input: ApplicationFormInput,
): FormFieldMapping[] {
  const label = normalizeLabel(field.label);
  const names = splitName(input.profile.fullName);
  const customAnswer = input.answers?.[label];

  if (customAnswer) {
    return [mappingFor(field, customAnswer)];
  }
  if (field.fieldType === "file" && label.includes("resume") && input.documents.resumePath) {
    return [mappingFor(field, input.documents.resumePath)];
  }
  if (field.fieldType === "file" && label.includes("cover letter") && input.documents.coverLetterPath) {
    return [mappingFor(field, input.documents.coverLetterPath)];
  }
  if (textField(field) && label.includes("first name")) {
    return [mappingFor(field, names.firstName)];
  }
  if (textField(field) && label.includes("last name")) {
    return [mappingFor(field, names.lastName)];
  }
  if (textField(field) && fullNameLabel(label)) {
    return [mappingFor(field, input.profile.fullName)];
  }
  if (textField(field) && label.includes("email")) {
    return [mappingFor(field, input.profile.email)];
  }
  if (textField(field) && label.includes("phone") && input.profile.phone) {
    return [mappingFor(field, input.profile.phone)];
  }
  if (textField(field) && locationLabel(label) && input.profile.location) {
    return [mappingFor(field, input.profile.location)];
  }

  return [];
}

async function fillMappedFields(
  page: ApplicationFormPage,
  mappings: FormFieldMapping[],
): Promise<void> {
  for (const mapping of mappings) {
    switch (mapping.fieldType) {
      case "file":
        await page.setFile(mapping.selector, String(mapping.value));
        break;
      case "select":
        await page.selectOption(mapping.selector, String(mapping.value));
        break;
      case "checkbox":
      case "radio":
        await page.setChecked(mapping.selector, mapping.value === true);
        break;
      case "input":
      case "textarea":
        await page.fillText(mapping.selector, String(mapping.value));
        break;
    }
  }
}

function requiredMissingLabels(
  fields: DetectedFormField[],
  mappings: FormFieldMapping[],
): string[] {
  const mappedSelectors = new Set(mappings.map((mapping) => mapping.selector));
  return fields
    .filter((field) => field.required && !mappedSelectors.has(field.selector))
    .map((field) => field.label);
}

function mappingFor(field: DetectedFormField, value: string | boolean): FormFieldMapping {
  return {
    selector: field.selector,
    fieldLabel: field.label,
    fieldType: field.fieldType,
    value,
    confidence: 0.95,
  };
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function textField(field: DetectedFormField): boolean {
  return field.fieldType === "input" || field.fieldType === "textarea" || field.fieldType === "select";
}

function fullNameLabel(label: string): boolean {
  return label === "name" || label.includes("full name");
}

function locationLabel(label: string): boolean {
  return label.includes("location") || label.includes("city") || label.includes("address");
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
