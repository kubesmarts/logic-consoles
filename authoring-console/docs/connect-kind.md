# Connect a local KIND cluster

This is the planned first-release experience. The release will supply the launcher and installation instructions. The example uses the operator’s standard KIND demo cluster. [Operator KIND setup](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/deployment/kind-local.adoc)

1. Start the installed Authoring Console launcher on the machine you use for `kubectl`. It opens the console in your default browser. Leave the launcher running while using the console.
2. On **Start**, confirm the context and namespace, then choose **Connect**. For the operator demo these are `kind-logic-operator-dev` and `default`. The launcher uses the credentials already configured for that context.
3. Open **hello-world → 1.0.0 → Run and wait**. Enter `{"name":"World"}` and look for `Hi, World!` in the response. History is available when the gateway has a working Data Index and the run has been indexed.

If the launcher reports that its port is occupied, free the port and retry to use the same address. You can also choose another port. The launcher remembers that choice. To reopen drafts saved at the earlier address, select the original port again and use the same browser profile.

If the expected context is missing, run `kubectl config get-contexts` on the same machine and check which kubeconfig the launcher loaded. If Kubernetes connects but the gateway is unreachable, check the discovered address on Start. The stock demo uses `http://gateway.lvh.me` through ingress-nginx. Correct the address if needed and retry. Publishing remains available while Kubernetes is connected.

For a remote cluster, select its kubeconfig context on the same Start page. An OpenShift context created by `oc login` uses the same flow.
