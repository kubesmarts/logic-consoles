# Connect a local KIND cluster

## Run from source

Use Node.js 24 LTS and a kubeconfig with a current context. From the repository root:

```sh
cd authoring-console
npm ci
npm run build
npm start
```

Keep the terminal open. The launcher opens your browser and prints its local address.
For subsequent launches of the same build, run `npm start` from this directory.
Use Ctrl+C to stop it.

## Development

Run `npm run dev` in `authoring-console` for the kubeconfig launcher with Vite hot reload. Restart it after editing the launcher TypeScript. Use `npm run dev:hosted` to develop the direct URL and token experience.

## Connect

The example below uses the operator’s standard demo. [Operator KIND setup](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/deployment/kind-local.adoc)

1. On **Start**, confirm the context and namespace, then choose **Connect**. For the operator demo these are `kind-logic-operator-dev` and `default`. The launcher uses the credentials already configured for that context.
2. Choose **Open console**. On a prepared demo cluster, open **hello-world → 1.0.0 → Run and wait**. Enter `{"name":"World"}` and look for `Hi, World!` in the response. History is available when the gateway has a working Data Index and the run has been indexed.

If the launcher reports that its port is occupied, free the port and retry to use the same address. You can also choose another port. The launcher remembers that choice. To reopen drafts saved at the earlier address, select the original port again and use the same browser profile.

If the expected context is missing, run `kubectl config get-contexts` on the same machine and check which kubeconfig the launcher loaded. If Kubernetes connects but the gateway is unreachable, check the discovered address on Start. The stock demo uses `http://gateway.lvh.me` through ingress-nginx. Correct the address if needed and retry. Publishing remains available while Kubernetes is connected.

For a remote cluster, select its kubeconfig context on the same Start page. An OpenShift context created by `oc login` uses the same flow.
