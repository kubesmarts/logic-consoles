/**
 * Gateway endpoint configuration step (Deliverable 6).
 * On K8s/KIND use ingress-nginx (class 'nginx' in the sample).
 * Show IngressClass + Ingress status where readable.
 */
import { type ReactNode } from "react";
import {
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Select,
  SelectOption,
  Alert,
  Content,
  AlertVariant,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from "@patternfly/react-core";
import { useQuery } from "@tanstack/react-query";
import { useConsole } from "../../app/ConsoleContext.tsx";
import type { PlatformSetupDraft, GatewayIngressConfig } from "../types.ts";

interface GatewayStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
}

export const GatewayStep = ({ draft, onUpdate }: GatewayStepProps): ReactNode => {
  const { kubernetes } = useConsole();

  // List IngressClasses
  const ingressClassesQuery = useQuery({
    queryKey: ["ingress-classes"],
    queryFn: ({ signal }) =>
      kubernetes
        .list(
          { gvk: { group: "networking.k8s.io", version: "v1", kind: "IngressClass" } },
          signal,
        )
        .then((res: unknown) => {
          if (res && typeof res === "object" && "items" in res) {
            return (res.items as Array<{ metadata?: { name?: string }; spec?: { controller?: string } }>)
              .map((item) => ({
                name: item.metadata?.name || "",
                controller: item.spec?.controller || "",
              }))
              .filter((ic) => ic.name)
              .sort((a, b) => a.name.localeCompare(b.name));
          }
          return [];
        }),
  });

  const ingressClasses = ingressClassesQuery.data ?? [];
  const hasNginx = ingressClasses.some((ic) => ic.name === "nginx");

  const gateway = draft.gatewayIngress;

  const handleUpdate = (updates: Partial<GatewayIngressConfig>): void => {
    onUpdate({
      gatewayIngress: { ...gateway, ...updates },
    });
  };

  return (
    <Form style={{ maxWidth: "600px" }}>
      <Alert isInline variant={AlertVariant.info} title="Workflow Gateway">
        The gateway exposes workflow execution APIs. Configure external access via Ingress (Kubernetes/KIND) or Route
        (OpenShift).
      </Alert>

      {!hasNginx && (
        <Alert isInline variant={AlertVariant.warning} title="ingress-nginx not found">
          <div style={{ marginBottom: "0.5rem" }}>
            This cluster doesn't have the community ingress-nginx controller. See{" "}
            <a href="https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/deployment/kind-local.adoc">
              cluster setup guidance
            </a>
            .
          </div>
        </Alert>
      )}

      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          Ingress configuration
        </Content>
        <FormGroup fieldId="gateway-ingress-enabled">
          <Checkbox
            id="gateway-ingress-enabled"
            label="Enable gateway ingress"
            isChecked={gateway.enabled}
            onChange={(_event, checked) => handleUpdate({ enabled: checked })}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Create Kubernetes Ingress for external access to the gateway</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        {gateway.enabled && (
          <>
            <FormGroup label="Gateway hostname" isRequired fieldId="gateway-host">
              <TextInput
                value={gateway.host || ""}
                onChange={(_event, value) => handleUpdate({ host: value })}
                placeholder="gateway.example.com"
                id="gateway-host"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>FQDN for accessing the gateway (e.g. gateway.example.com or gateway.lvh.me)</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup label="Ingress class" fieldId="gateway-ingress-class">
              <Select
                selections={gateway.ingressClassName || ""}
                onSelect={(_, value) => handleUpdate({ ingressClassName: String(value) || undefined })}
                isOpen={false}
                placeholderText="Select or type ingress class"
                isCreatable
                isCreateOptionOnTop
              >
                {ingressClasses.map((ic) => (
                  <SelectOption key={ic.name} value={ic.name}>
                    {ic.name}
                  </SelectOption>
                ))}
              </Select>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Ingress controller class (e.g. nginx). Defaults to cluster default.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </>
        )}
      </div>

      <Content component="small">
        After the platform reconciles, the gateway will be reachable at the configured hostname through the Ingress controller. Status
        is shown in the review step.
      </Content>
    </Form>
  );
};
