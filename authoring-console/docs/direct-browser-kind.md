# Manual KIND setup for direct browser access

Use these directions when your browser and Docker-backed KIND cluster run on the same machine. Once an administrator prepares the cluster, an author only needs the **Connect from the Start page** section. The browser connects directly to two addresses.

| Start field | Value for the operator's local demo |
| --- | --- |
| Kubernetes API URL | The HTTPS loopback URL printed by kubectl below, including its assigned port |
| Token | A short-lived token for the demo author |
| Workflow namespace | `default` |
| Workflow Gateway URL | `https://gateway.lvh.me` |

### Prepare the demo cluster

Use the operator's local KIND guide to install the prerequisites, operator, and hello-world sample on a fresh demo cluster. The examples below assume its cluster name `logic-operator-dev`, platform `default`, platform namespace `logic-platform`, and runtime `default/hello-runtime`. For an existing cluster, use its actual names and skip sample installation. The instructions use a POSIX-style shell, kubectl, Docker, OpenSSL, and mkcert for gateway TLS. [Operator KIND setup](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/deployment/kind-local.adoc) · [Install mkcert](https://github.com/FiloSottile/mkcert#installation)

Open the console webpage and copy its **origin** (scheme, host and port, with no path or trailing slash). The examples use `https://console.example.test` as a placeholder. Replace it wherever it appears. For a local frontend running at `http://localhost:5173`, use that literal origin. Use the browser on the machine that owns the KIND loopback address.

```sh
demo_context=kind-logic-operator-dev
demo_node=logic-operator-dev-control-plane
demo_dir=$(mktemp -d)
kubectl --context="$demo_context" get clusterlogicplatform default
kubectl --context="$demo_context" -n default get logicflowruntime hello-runtime
kubectl --context="$demo_context" -n ingress-nginx rollout status deployment/ingress-nginx-controller
```

### Allow the browser to reach the Kubernetes API

1. **Trust the local API certificate.** Export the public cluster CA from this specific context. Import `kind-ca.crt` as a trusted certificate authority in the browser or its OS trust store. For example, on macOS open Keychain Access, import it into the login keychain and enable trust for SSL. In Firefox with its own trust store, use Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import. Limit this trust to your demo machine and remove it when retiring the cluster.

   ```sh
   kubectl --context="$demo_context" config view --minify --flatten --raw \
     -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' \
     | openssl base64 -d -A > "$demo_dir/kind-ca.crt"
   demo_api=$(kubectl --context="$demo_context" config view --minify \
     -o jsonpath='{.clusters[0].cluster.server}')
   echo "$demo_api"
   ```

2. **Allow the console origin.** The operator's stock KIND config leaves API CORS unset. For an existing single-control-plane demo cluster, copy its API server manifest into the temporary directory and edit the copy. This change restarts the local API server briefly. Skip the edit if the exact origin is already allowed. [API server CORS option](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/#options)

   ```sh
   docker cp "$demo_node:/etc/kubernetes/manifests/kube-apiserver.yaml" "$demo_dir/apiserver.original.yaml"
   cp "$demo_dir/apiserver.original.yaml" "$demo_dir/apiserver.yaml"
   ```

   In `apiserver.yaml`, add the following single argument beside the existing `- --...` entries under the kube-apiserver container's `command`. The value is a regular expression. Match the whole origin and escape hostname dots. For the local frontend example use `^http://localhost:5173$`. If the flag already exists, append the expression to its comma-separated value and preserve existing origins.

   ```yaml
   - --cors-allowed-origins=^https://console\.example\.test$
   ```

   Install the edited file atomically. Keep the backup outside the watched manifest directory. Once Kubernetes restarts, check the preflight response for the exact `Access-Control-Allow-Origin` and support for `Authorization`. To restore the original manifest, repeat the copy and move with `apiserver.original.yaml` as the source.

   ```sh
   docker cp "$demo_dir/apiserver.yaml" "$demo_node:/etc/kubernetes/manifests/.apiserver.pending"
   docker exec "$demo_node" mv /etc/kubernetes/manifests/.apiserver.pending /etc/kubernetes/manifests/kube-apiserver.yaml
   curl --cacert "$demo_dir/kind-ca.crt" -si -X OPTIONS "$demo_api/apis" \
     -H 'Origin: https://console.example.test' \
     -H 'Access-Control-Request-Method: GET' \
     -H 'Access-Control-Request-Headers: authorization'
   ```

### Enable HTTPS and CORS on the gateway

The operator's example maps ports 80 and 443 through ingress-nginx. Its gateway hostname `gateway.lvh.me` should resolve to loopback on the workstation. Create a locally trusted certificate for that host and put the TLS Secret in the platform's target namespace.

```sh
mkcert -install
mkcert -cert-file "$demo_dir/gateway.crt" -key-file "$demo_dir/gateway.key" gateway.lvh.me
kubectl --context="$demo_context" -n logic-platform create secret tls console-demo-gateway-tls \
  --cert="$demo_dir/gateway.crt" --key="$demo_dir/gateway.key"
```

For the demo platform, save the following as `gateway-browser.yaml` in your temporary directory. Replace the example origin with the literal origin of the console. Apply it as a merge patch to the platform so the operator owns the resulting Ingress. If your platform already has a working TLS issuer or Secret, retain its TLS settings and apply only the CORS annotations. [Ingress CORS annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#enable-cors)

```yaml
spec:
  gateway:
    ingress:
      enabled: true
      ingressClassName: nginx
      host: gateway.lvh.me
      tls:
        enabled: true
        secretRef:
          name: console-demo-gateway-tls
      annotations:
        nginx.ingress.kubernetes.io/enable-cors: "true"
        nginx.ingress.kubernetes.io/cors-allow-origin: "https://console.example.test"
        nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, OPTIONS"
        nginx.ingress.kubernetes.io/cors-allow-headers: "Authorization, Content-Type, Accept"
```

```sh
kubectl --context="$demo_context" patch clusterlogicplatform default \
  --type=merge --patch-file="$demo_dir/gateway-browser.yaml"
kubectl --context="$demo_context" -n logic-platform get ingress
curl --cacert "$(mkcert -CAROOT)/rootCA.pem" -si -X OPTIONS \
  https://gateway.lvh.me/v1/runtime/default/hello-world/1.0.0/sync \
  -H 'Origin: https://console.example.test' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect the gateway preflight to allow the console origin and POST. The browser should also be able to open `https://gateway.lvh.me/v1/openapi.json` without a certificate warning.

### Give the demo author an identity

As the cluster administrator, run this once. The example grants an author permission to inspect the platform, select an existing runtime and publish definitions in `default`. The gateway uses its own existing service account for discovery. For a platform administration demo, use a separate identity with your intended platform and runtime management permissions.

```sh
kubectl --context="$demo_context" -n default create serviceaccount console-demo-author
kubectl --context="$demo_context" create clusterrole console-demo-platform-reader \
  --verb=get,list,watch --resource=clusterlogicplatforms.logic.kubesmarts.org
kubectl --context="$demo_context" create clusterrolebinding console-demo-platform-reader \
  --clusterrole=console-demo-platform-reader --serviceaccount=default:console-demo-author
kubectl --context="$demo_context" -n default create role console-demo-runtime-reader \
  --verb=get,list,watch --resource=logicflowruntimes.logic.kubesmarts.org
kubectl --context="$demo_context" -n default create rolebinding console-demo-runtime-reader \
  --role=console-demo-runtime-reader --serviceaccount=default:console-demo-author
kubectl --context="$demo_context" -n default create role console-demo-publisher \
  --verb=get,list,watch,create,update,patch --resource=logicflowdefinitions.logic.kubesmarts.org
kubectl --context="$demo_context" -n default create rolebinding console-demo-publisher \
  --role=console-demo-publisher --serviceaccount=default:console-demo-author
```

### Connect from the Start page

1. Get the API URL and a token for the prepared identity. Run these commands as someone allowed to request its token. The second command prints the credential to paste into **Token**. Request a fresh one when it expires. [kubectl create token](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/)

   ```sh
   kubectl --context=kind-logic-operator-dev config view --minify -o jsonpath='{.clusters[0].cluster.server}{"\n"}'
   kubectl --context=kind-logic-operator-dev -n default create token console-demo-author --duration=30m
   ```

2. Enter the four values in the table at the top of this guide and choose **Connect**. If the browser prompts for local network access, grant it to the console origin for this demo.
3. Open the deployed `default/hello-world` version `1.0.0`. Choose **Run and wait** with `{"name":"World"}`. Look for `Hi, World!` in the response. The basic sample works with history disabled. History becomes available when the gateway has a working Data Index and the runtime's events have been ingested.

### If the connection fails

| Symptom | Check |
| --- | --- |
| Kubernetes API cannot be reached | Open the API URL plus `/version` in the same browser. An HTTP response, including 401 or 403, establishes transport connectivity. Check the port and trust the CA for this particular KIND cluster. |
| Browser reports a network error but curl succeeds | Check local network permission and the Network tab for the failing endpoint's OPTIONS request. Compare the page's exact origin, including port, with its allowed origin. Check HTTPS and certificate trust on each endpoint. |
| API returns 401 or 403 | For 401, request a fresh token for the selected cluster. For 403, inspect the denied verb and resource. The sample author can enter `default` directly and has read-only platform access. |
| API works but Run cannot reach the gateway | Check the gateway host resolves to loopback, port 443 maps to the ingress controller, the TLS Secret is in the target namespace and the gateway OPTIONS check succeeds. |
| Run succeeds but history is empty or unavailable | Check Data Index discovery separately from execution. For the history-enabled sample, also check runtime structured logging and Vector's watched namespace. |
