/**
 * Schema-driven form builder for workflow input.
 *
 * Renders PatternFly form controls for the supported JSON Schema subset:
 * objects, required properties, primitives, nested objects, arrays, enums.
 */
import { type ReactNode } from "react";
import {
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  FormSelect,
  FormSelectOption,
  TextArea,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from "@patternfly/react-core";
import type { SupportedJsonSchema, JsonSchemaProperty } from "./types.ts";

export interface SchemaFormProps {
  readonly schema: SupportedJsonSchema;
  readonly value: Record<string, unknown>;
  readonly onChange: (value: Record<string, unknown>) => void;
  readonly errors?: readonly string[];
}

export const SchemaForm = ({ schema, value, onChange, errors }: SchemaFormProps): ReactNode => {
  const handleFieldChange = (key: string, fieldValue: unknown): void => {
    onChange({ ...value, [key]: fieldValue });
  };

  const properties = schema.properties || {};
  const required = schema.required || [];

  return (
    <Form>
      {Object.entries(properties).map(([key, prop]) => (
        <SchemaField
          key={key}
          name={key}
          property={prop}
          value={value[key]}
          onChange={(v) => handleFieldChange(key, v)}
          required={required.includes(key)}
          errors={errors}
        />
      ))}
      {errors && errors.length > 0 && (
        <FormHelperText>
          <HelperText>
            {errors.map((err, idx) => (
              <HelperTextItem key={idx} variant="error">
                {err}
              </HelperTextItem>
            ))}
          </HelperText>
        </FormHelperText>
      )}
    </Form>
  );
};

interface SchemaFieldProps {
  readonly name: string;
  readonly property: JsonSchemaProperty;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly required: boolean;
  readonly errors?: readonly string[];
}

const SchemaField = ({ name, property, value, onChange, required }: SchemaFieldProps): ReactNode => {
  const label = formatLabel(name);

  if (property.type === "string" && property.enum) {
    // Enum: use FormSelect
    const stringValue = String(value || "");
    return (
      <FormGroup label={label} isRequired={required} fieldId={name}>
        <FormSelect
          id={name}
          value={stringValue}
          onChange={(_event, v) => onChange(v)}
          aria-label={label}
        >
          <FormSelectOption value="" label="Select an option" />
          {property.enum.map((option) => (
            <FormSelectOption key={String(option)} value={String(option)} label={String(option)} />
          ))}
        </FormSelect>
      </FormGroup>
    );
  }

  if (property.type === "string") {
    const stringValue = String(value || "");
    return (
      <FormGroup label={label} isRequired={required} fieldId={name}>
        <TextInput
          id={name}
          type="text"
          value={stringValue}
          onChange={(_event, v) => onChange(v)}
          aria-label={label}
        />
      </FormGroup>
    );
  }

  if (property.type === "number" || property.type === "integer") {
    const numberValue = typeof value === "number" ? value : 0;
    return (
      <FormGroup label={label} isRequired={required} fieldId={name}>
        <TextInput
          id={name}
          type="number"
          value={numberValue}
          onChange={(_event, v) => onChange(property.type === "integer" ? parseInt(v, 10) : parseFloat(v))}
          aria-label={label}
        />
      </FormGroup>
    );
  }

  if (property.type === "boolean") {
    const boolValue = Boolean(value);
    return (
      <FormGroup label={label} isRequired={required} fieldId={name}>
        <Checkbox
          id={name}
          isChecked={boolValue}
          onChange={(_event, checked) => onChange(checked)}
          label={label}
          aria-label={label}
        />
      </FormGroup>
    );
  }

  if (property.type === "object") {
    // Nested object: render as JSON text area for now
    const jsonValue = typeof value === "object" && value !== null
      ? JSON.stringify(value, null, 2)
      : "{}";
    return (
      <FormGroup label={`${label} (object)`} isRequired={required} fieldId={name}>
        <TextArea
          id={name}
          value={jsonValue}
          onChange={(_event, v) => {
            try {
              onChange(JSON.parse(v));
            } catch {
              // Keep the string until it's valid JSON
              onChange(v);
            }
          }}
          aria-label={label}
          rows={4}
        />
      </FormGroup>
    );
  }

  if (property.type === "array") {
    // Array: render as JSON text area
    const jsonValue = Array.isArray(value) ? JSON.stringify(value, null, 2) : "[]";
    return (
      <FormGroup label={`${label} (array)`} isRequired={required} fieldId={name}>
        <TextArea
          id={name}
          value={jsonValue}
          onChange={(_event, v) => {
            try {
              onChange(JSON.parse(v));
            } catch {
              onChange(v);
            }
          }}
          aria-label={label}
          rows={4}
        />
      </FormGroup>
    );
  }

  return null;
};

/** Convert camelCase or snake_case to Title Case. */
const formatLabel = (name: string): string => {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};
