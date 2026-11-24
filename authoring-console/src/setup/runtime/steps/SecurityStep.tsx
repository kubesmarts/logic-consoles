/**
 * Runner security configuration step.
 */
import { type ReactNode, useCallback } from "react";
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
  Alert,
  TextInput,
} from "@patternfly/react-core";
import type { RuntimeSetupDraft } from "../types.ts";

interface SecurityStepProps {
  readonly draft: RuntimeSetupDraft;
  readonly onChange: (updates: Partial<RuntimeSetupDraft>) => void;
}

export const SecurityStep = ({ draft, onChange }: SecurityStepProps): ReactNode => {
  const handleSecurityNoneChange = useCallback(() => {
    onChange({
      security: {
        type: "NONE",
      },
    });
  }, [onChange]);

  const handleSecurityApiKeyChange = useCallback(() => {
    onChange({
      security: {
        type: "API_KEY",
        apiKey: { keys: [] },
      },
    });
  }, [onChange]);

  const handleSecurityOidcChange = useCallback(() => {
    onChange({
      security: {
        type: "OIDC",
        oidc: { authServerUrl: "", clientId: "", clientSecretName: "", clientSecretKey: "value" },
      },
    });
  }, [onChange]);

  const handleOidcAuthServerUrlChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (draft.security?.oidc) {
        onChange({
          security: {
            ...draft.security,
            oidc: { ...draft.security.oidc, authServerUrl: value },
          },
        });
      }
    },
    [onChange, draft.security],
  );

  const handleOidcClientIdChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (draft.security?.oidc) {
        onChange({
          security: {
            ...draft.security,
            oidc: { ...draft.security.oidc, clientId: value },
          },
        });
      }
    },
    [onChange, draft.security],
  );

  const handleOidcClientSecretNameChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (draft.security?.oidc) {
        onChange({
          security: {
            ...draft.security,
            oidc: { ...draft.security.oidc, clientSecretName: value },
          },
        });
      }
    },
    [onChange, draft.security],
  );

  return (
    <PageSection style={{ maxWidth: "50rem" }}>
      <Title headingLevel="h1">Security configuration</Title>
      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <p>
          Configure authentication for workflow runtime HTTP endpoints. NONE mode should only be
          used in development environments.
        </p>
      </div>

      <Form>
        <FormGroup
          label="Security type"
          isRequired
          fieldId="security-type"
        >
          <Radio
            id="security-none"
            name="security-type"
            label="NONE (development only)"
            description="No authentication required. Use only in development/testing."
            isChecked={draft.security?.type === "NONE" || !draft.security}
            onChange={handleSecurityNoneChange}
          />
          <Radio
            id="security-apikey"
            name="security-type"
            label="API_KEY (machine-to-machine)"
            description="API key-based authentication for service-to-service calls."
            isChecked={draft.security?.type === "API_KEY"}
            onChange={handleSecurityApiKeyChange}
          />
          <Radio
            id="security-oidc"
            name="security-type"
            label="OIDC (enterprise SSO)"
            description="OpenID Connect authentication for enterprise environments."
            isChecked={draft.security?.type === "OIDC"}
            onChange={handleSecurityOidcChange}
          />
        </FormGroup>

        {draft.security?.type === "NONE" && (
          <Alert
            variant="warning"
            title="Development mode"
            isInline
            style={{ marginTop: "1rem" }}
          >
            NONE security mode disables authentication. This should only be used in development
            environments. Production deployments should use API_KEY or OIDC authentication.
          </Alert>
        )}

        {draft.security?.type === "API_KEY" && (
          <Alert
            variant="info"
            title="API key configuration"
            isInline
            style={{ marginTop: "1rem" }}
          >
            API key authentication requires you to create Kubernetes Secrets containing the API
            keys. Configure the keys and their roles in the advanced YAML editor on the review step.
            Refer to the operator documentation for the full API key configuration structure.
          </Alert>
        )}

        {draft.security?.type === "OIDC" && (
          <>
            <FormGroup
              label="OIDC auth server URL"
              isRequired
              fieldId="oidc-auth-server"
            >
              <TextInput
                id="oidc-auth-server"
                type="text"
                value={draft.security.oidc?.authServerUrl || ""}
                onChange={handleOidcAuthServerUrlChange}
                aria-label="OIDC auth server URL"
                placeholder="https://auth.example.com"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>The OpenID Connect provider URL</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup
              label="Client ID"
              isRequired
              fieldId="oidc-client-id"
            >
              <TextInput
                id="oidc-client-id"
                type="text"
                value={draft.security.oidc?.clientId || ""}
                onChange={handleOidcClientIdChange}
                aria-label="OIDC client ID"
                placeholder="workflow-runtime"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>OAuth2 client ID</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup
              label="Client secret (Secret name)"
              isRequired
              fieldId="oidc-client-secret"
            >
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Name of the Kubernetes Secret containing the OAuth2 client secret</HelperTextItem>
                </HelperText>
              </FormHelperText>
              <TextInput
                id="oidc-client-secret"
                type="text"
                value={draft.security.oidc?.clientSecretName || ""}
                onChange={handleOidcClientSecretNameChange}
                aria-label="OIDC client secret name"
                placeholder="oidc-client-secret"
              />
            </FormGroup>

            <Alert
              variant="info"
              title="OIDC Secret dependency"
              isInline
              style={{ marginTop: "1rem" }}
            >
              Ensure the referenced Secret exists in the runtime namespace and contains the OAuth2
              client secret in the specified key (default: "value"). Configure roles claim and
              additional OIDC settings in the advanced YAML editor.
            </Alert>
          </>
        )}
      </Form>
    </PageSection>
  );
};
