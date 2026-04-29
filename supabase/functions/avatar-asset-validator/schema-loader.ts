import Ajv from "https://esm.sh/ajv@8.17.1";
import addFormats from "https://esm.sh/ajv-formats@2.1.1";
import schema from "./metadata.schema.json" with { type: "json" };

export interface SchemaError {
  field: string;
  message: string;
  schema_path: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaError[];
}

// Module-level singleton: re-initialised per isolate, shared across all requests within one isolate.
let _validateFn: ((data: unknown) => boolean) | null = null;
let _getErrors: (() => unknown[] | null | undefined) | null = null;

function ensureValidator(): void {
  if (_validateFn !== null) return;

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const compiled = ajv.compile(schema);

  _validateFn = (data: unknown): boolean => compiled(data) as boolean;
  _getErrors = (): unknown[] | null | undefined =>
    compiled.errors as unknown[] | null | undefined;
}

export async function validateAgainstSchema(
  data: unknown,
): Promise<SchemaValidationResult> {
  try {
    ensureValidator();

    const valid = _validateFn!(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const rawErrors = _getErrors!();
    const errors: SchemaError[] = (rawErrors ?? []).map((raw: unknown) => {
      const err = raw as Record<string, unknown>;
      return {
        field:
          typeof err["instancePath"] === "string"
            ? err["instancePath"] || "(root)"
            : "(root)",
        message:
          typeof err["message"] === "string"
            ? err["message"]
            : "Schema validation failed",
        schema_path:
          typeof err["schemaPath"] === "string" ? err["schemaPath"] : "",
      };
    });

    return { valid: false, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [
        {
          field: "(schema-loader)",
          message: `Schema validation system error: ${message}`,
          schema_path: "",
        },
      ],
    };
  }
}
