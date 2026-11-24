import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Button,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Page,
  PageSection,
  Spinner,
  TextInput,
  Title,
} from "@patternfly/react-core";
import { useNavigate } from "react-router-dom";
import { App } from "../app/App.tsx";
import { useConsole } from "../app/ConsoleContext.tsx";
import { authoringRoutes } from "../authoring/index.tsx";
import {
  connectDirect,
  connectLauncher,
  findLauncher,
  installationText,
  launcherHeaders,
  type ConnectedSession,
  type LauncherSession,
} from "./live-session.ts";

type Host = { launcher: LauncherSession | null; contexts: string[] };
const installDocs =
  "https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/deployment/install.adoc";

async function loadHost(signal?: AbortSignal): Promise<Host> {
  const launcher = await findLauncher(window.location.hostname, signal);
  if (!launcher) return { launcher: null, contexts: [] };
  const response = await fetch("/api/contexts", {
    headers: launcherHeaders(launcher),
    signal,
  });
  const contexts: { name: string }[] = response.ok ? await response.json() : [];
  return {
    launcher,
    contexts: [
      ...new Set([
        launcher.context.contextName,
        ...contexts.map((item) => item.name),
      ]),
    ],
  };
}

function ConnectionDetails({
  connection,
  disconnect,
}: {
  connection: ConnectedSession;
  disconnect: () => Promise<void>;
}): ReactNode {
  const { session } = useConsole();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <PageSection>
      <Title headingLevel="h1">Cluster connection</Title>
      <Content component="p">
        {session.context.clusterDisplay} · Namespace {session.namespace}
      </Content>
      <Content component="p">
        {installationText(connection.installation)}
      </Content>
      <Content component="p">Gateway: {connection.gatewayStatus}</Content>
      {error && <Alert isInline variant="danger" title={error} />}
      <Button
        isDisabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await disconnect();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Unable to disconnect.",
            );
            setBusy(false);
          }
        }}
      >
        Disconnect and change connection
      </Button>
    </PageSection>
  );
}

export function ConnectionHost(): ReactNode {
  const navigate = useNavigate();
  const [host, setHost] = useState<Host>();
  const [context, setContext] = useState("");
  const [api, setApi] = useState("");
  const [token, setToken] = useState("");
  const [gatewayUrl, setGateway] = useState("");
  const [namespace, setNamespace] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConnectedSession>();
  const [entered, setEntered] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadHost(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setHost(next);
        setContext(next.launcher?.context.contextName ?? "");
        setGateway(next.launcher?.gatewayUrl ?? "");
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [attempt]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!host || busy) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const next = host.launcher
        ? await connectLauncher(host.launcher, context, namespace, gatewayUrl)
        : await connectDirect({ k8sApiUrl: api, token, gatewayUrl }, namespace);
      setResult(next);
      if (next.launcher) setHost({ ...host, launcher: next.launcher });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect.");
      if (host.launcher) {
        // A successful context change rotates the key even if subsequent discovery failed.
        const current = await findLauncher(window.location.hostname).catch(
          () => null,
        );
        if (current) setHost({ ...host, launcher: current });
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    result?.close?.();
    if (result?.launcher) {
      const response = await fetch("/api/disconnect", {
        method: "POST",
        headers: launcherHeaders(result.launcher),
      });
      if (!response.ok && response.status !== 409)
        throw new Error(`Disconnect failed (HTTP ${response.status}).`);
    }
    setResult(undefined);
    setEntered(false);
    setHost(undefined);
    setToken("");
    setAttempt((value) => value + 1);
    navigate("/workflows", { replace: true });
  }

  if (entered && result)
    return (
      <App
        key={result.services.session.sessionId}
        services={result.services}
        featureRoutes={[
          ...authoringRoutes,
          {
            path: "/connection",
            element: (
              <ConnectionDetails connection={result} disconnect={disconnect} />
            ),
          },
        ]}
      />
    );

  return (
    <Page>
      <PageSection
        style={{ maxWidth: "48rem", width: "100%", margin: "2rem auto" }}
      >
        <Title headingLevel="h1">Connect to a cluster</Title>
        {error && (
          <Alert isInline variant="danger" title="Connection failed">
            {error}
          </Alert>
        )}
        {!host ? (
          error ? (
            <Button
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </Button>
          ) : (
            <Spinner aria-label="Checking for local launcher" />
          )
        ) : (
          <Form
            onSubmit={connect}
            onChange={() => setResult(undefined)}
            style={{ marginTop: "1.5rem" }}
          >
            {host.launcher ? (
              <FormGroup label="Kubeconfig context" fieldId="context">
                <FormSelect
                  id="context"
                  value={context}
                  isDisabled={busy}
                  onChange={(_, value) => setContext(value)}
                >
                  {host.contexts.map((name) => (
                    <FormSelectOption key={name} value={name} label={name} />
                  ))}
                </FormSelect>
              </FormGroup>
            ) : (
              <>
                <Content component="p">
                  Enter a browser-reachable Kubernetes API with a trusted
                  certificate and CORS enabled. For KIND, open the local
                  launcher to use your kubeconfig.
                </Content>
                <FormGroup label="Kubernetes API URL" isRequired fieldId="api">
                  <TextInput
                    id="api"
                    required
                    isDisabled={busy}
                    value={api}
                    onChange={(_, value) => setApi(value)}
                    placeholder="https://api.cluster.example:6443"
                  />
                </FormGroup>
                <FormGroup
                  label="Kubernetes bearer token"
                  isRequired
                  fieldId="token"
                >
                  <TextInput
                    type="password"
                    id="token"
                    required
                    autoComplete="off"
                    isDisabled={busy}
                    value={token}
                    onChange={(_, value) => setToken(value)}
                  />
                </FormGroup>
              </>
            )}
            <FormGroup label="Namespace" isRequired fieldId="namespace">
              <TextInput
                id="namespace"
                required
                maxLength={63}
                pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
                isDisabled={busy}
                value={namespace}
                onChange={(_, value) => setNamespace(value)}
              />
            </FormGroup>
            <FormGroup label="Workflow Gateway URL" fieldId="gateway">
              <TextInput
                id="gateway"
                isDisabled={busy}
                value={gatewayUrl}
                placeholder="https://gateway.cluster.example"
                onChange={(_, value) => setGateway(value)}
              />
            </FormGroup>
            <div>
              <Button type="submit" isLoading={busy} isDisabled={busy}>
                {result ? "Check again" : "Connect"}
              </Button>
            </div>
          </Form>
        )}
        {result && (
          <div style={{ marginTop: "1rem" }}>
            <Alert
              isInline
              variant={
                result.installation.kind === "installed" ? "success" : "warning"
              }
              title={installationText(result.installation)}
            >
              {["missing-apis", "partial-install"].includes(
                result.installation.kind,
              ) && (
                <a href={installDocs} target="_blank" rel="noreferrer">
                  Operator installation instructions
                </a>
              )}
            </Alert>
            <Content component="p">Gateway: {result.gatewayStatus}</Content>
            <Button
              onClick={() => {
                setToken("");
                setEntered(true);
              }}
            >
              Open console
            </Button>
          </div>
        )}
      </PageSection>
    </Page>
  );
}
