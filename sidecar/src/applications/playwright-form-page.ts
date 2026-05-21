import type { ApplicationFormPage, DetectedFormField, FormFieldType } from "./form-filler.js";

export type PlaywrightLocatorLike = {
  fill: (value: string) => Promise<void>;
  selectOption: (value: string) => Promise<void>;
  setChecked: (checked: boolean) => Promise<void>;
  setInputFiles: (path: string) => Promise<void>;
};

export type PlaywrightFormPageLike = {
  evaluate: <Result>(pageFunction: () => Result | Promise<Result>) => Promise<Result>;
  locator: (selector: string) => PlaywrightLocatorLike;
  url: () => string;
};

type BrowserDetectedField = DetectedFormField & {
  selector: string;
};

export function createPlaywrightFormPage(page: PlaywrightFormPageLike): ApplicationFormPage {
  return {
    fields: () => page.evaluate(discoverFormFields),
    fillText: (selector, value) => page.locator(selector).fill(value),
    selectOption: (selector, value) => page.locator(selector).selectOption(value),
    setChecked: (selector, checked) => page.locator(selector).setChecked(checked),
    setFile: (selector, path) => page.locator(selector).setInputFiles(path),
    url: async () => page.url(),
  };
}

function discoverFormFields(): BrowserDetectedField[] {
  return Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((control) => isVisibleControl(control))
    .flatMap((control, index) => {
      const fieldType = detectFieldType(control);
      if (!fieldType) {
        return [];
      }

      return [
        {
          selector: stableSelector(control, index),
          label: labelForControl(control),
          fieldType,
          required: isRequired(control),
          ...(control instanceof HTMLSelectElement
            ? {
                options: Array.from(control.options)
                  .map((option) => option.textContent?.trim() ?? "")
                  .filter(Boolean),
              }
            : {}),
        },
      ];
    });
}

function detectFieldType(control: Element): FormFieldType | null {
  if (control instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (control instanceof HTMLSelectElement) {
    return "select";
  }
  if (!(control instanceof HTMLInputElement)) {
    return null;
  }

  switch (control.type) {
    case "checkbox":
      return "checkbox";
    case "file":
      return "file";
    case "radio":
      return "radio";
    case "button":
    case "hidden":
    case "image":
    case "reset":
    case "submit":
      return null;
    default:
      return "input";
  }
}

function labelForControl(control: Element): string {
  if (control.id) {
    const explicitLabel = document.querySelector(`label[for="${cssEscape(control.id)}"]`);
    const labelText = explicitLabel?.textContent?.trim();
    if (labelText) {
      return labelText;
    }
  }

  const wrappingLabel = control.closest("label")?.textContent?.trim();
  if (wrappingLabel) {
    return wrappingLabel;
  }

  const ariaLabel = control.getAttribute("aria-label")?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  const placeholder = control.getAttribute("placeholder")?.trim();
  if (placeholder) {
    return placeholder;
  }

  return control.getAttribute("name")?.trim() ?? "Unlabeled field";
}

function stableSelector(control: Element, index: number): string {
  if (control.id) {
    return `#${cssEscape(control.id)}`;
  }

  const name = control.getAttribute("name");
  if (name) {
    return `${control.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  }

  return `${control.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
}

function isRequired(control: Element): boolean {
  return control.hasAttribute("required") || control.getAttribute("aria-required") === "true";
}

function isVisibleControl(control: Element): boolean {
  if (control instanceof HTMLInputElement && control.type === "hidden") {
    return false;
  }

  return control.getAttribute("aria-hidden") !== "true";
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
