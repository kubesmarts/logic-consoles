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
  Button,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from "@patternfly/react-core";
import { getDefaultValue } from "./schema-utils.ts";
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
    const fields = value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    return (
      <fieldset>
        <legend>{label}</legend>
        {Object.entries(property.properties ?? {}).map(([key, child]) => (
          <SchemaField key={key} name={name + "." + key} property={child} value={fields[key]}
            required={property.required?.includes(key) ?? false}
            onChange={(next) => onChange({ ...fields, [key]: next })} />
        ))}
      </fieldset>
    );
  }

  if (property.type === "array" && property.items) {
    const values: unknown[] = Array.isArray(value) ? value : [];
    const items = property.items;
    return (
      <fieldset>
        <legend>{label}</legend>
        {values.map((item, index) => (
          <div key={index}>
            <SchemaField name={name + "." + (index + 1)} property={items} value={item} required
              onChange={(next) => onChange(values.map((old, i) => index === i ? next : old))} />
            <Button variant="link" onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove {label} item {index + 1}</Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => onChange([...values, getDefaultValue(items)])}>Add {label} item</Button>
      </fieldset>
    );
  }

  return null;
};

/** Convert camelCase or snake_case to Title Case. */
const formatLabel = (name: string): string => {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_.]/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};
