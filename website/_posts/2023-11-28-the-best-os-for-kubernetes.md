---
title: The Best OS For Kubernetes
description: If you're not using Talos Linux for Kubernetes, you're (probably) doing it wrong. Here’s why.
tags:
  - kubernetes
  - talos_linux

# img_path: /assets/img/posts/2023-11-28-the-best-os-for-kubernetes/
image:
  path: /assets/img/posts/2023-11-28-the-best-os-for-kubernetes/featured.webp
  lqip: /assets/img/posts/2023-11-28-the-best-os-for-kubernetes/featured_lqip.webp
# This permalink is needed for backwards compatibility
permalink: /posts/:year-:month-:day-:title/
date: 2023-11-28
---

How quickly can you tear down and redeploy your Kubernetes cluster? What if I told you it takes me less than 5 minutes to get from ISO to `kubectl`?

## The Relic of the Past

![Old Ubuntu being old](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/ubuntu-old.webp)
_"Old Ubuntu Being Old" by [bomkii](https://bomkii.com)_

When setting up an on-prem Kubernetes cluster, the usual process involves installing, configuring and hardening a base OS like Ubuntu or RHEL, installing a 3rd party tool to deploy kubernetes and then - _finally_ - deploying Kubernetes. While this approach is not wrong per-se, it has plenty of drawbacks.

Manual configuration is error-prone, and relying on third-party automation introduces trust issues. Ansible playbooks, terraform providers and even plain old bash scripts eventually get out of date, and then it's up to the maintainer to update them, fix bugs or add new features. More often than not, though, this doesn't happen either at all or as fast as we would need/want to.

Another aspect to consider is that when it comes to our container images, the general consensus is that it is best to use a minimal and purpose-built base image, such as `alpine` or even `scratch`. Why is it then, that when it comes the cluster itself, we don't think about it in the same way? We go for "bloated" base images, like Ubuntu and then build on top of that, instead of choosing purpose-built solutions.

## The Modern Approach

In short, Talos Linux is simply Linux, but designed for Kubernetes. It is a minimal distro, built specifically to run containers and not much else. Essentially, Talos is an OS managed by a collection of services running within containers, similar to Kubernetes itself.

![Talos Linux Logo Banner](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/talos-banner.webp)
_Talos Linux Logo Banner from [talos.dev](https://talos.dev)_

It is secure by default. There is no shell or SSH access. Talos is an API-driven OS, and this means that all configuration and OS management is done via an API that is extremely similar to that of Kubernetes. To interact with the API, we have a command-line utility called `talosctl`, which, as you might have guessed, is very similar to `kubectl` in terms of user experience.

Talos is immutable, since it mounts the rootfs as `read-only`, and ephemeral, meaning that it runs in memory. This, alongside its atomic update model allows us to manage OS upgrades similarly to how we're managing helm releases. When an upgrade is issued, Talos uses an A-B scheme and retains the previous os image so that it can be easily rolled back. Essentially, just like we `helm upgrade` and `helm rollback`, so can we `talosctl upgrade` and `talosctl rollback`

And what's probably my favorite feature, is that everything, absolutely everything is configured via a YAML file. The OS will pull the yaml config on each boot, making sure that whatever state we defined in our configuration is the state the OS is currently in. This effectively removes the possibility of configuration drift and snowflake servers. We can `talosctl reset` our cluster and then get back up and running in no time, all thanks to this config file.

Are you interested? Let's get on with the demo!

## Demo

For this demo, we will:

1. Deploy a 3-node Talos Cluster in a Proxmox Virtual Environment
2. Bootstrap Kubernetes on the Talos cluster
3. Configure a virtual IP to loadbalance requests to the Kubernetes API
4. Configure our local machine to talk to the Kubernetes API
5. Deploy an NGINX web server to our cluster and expose it

![Demo Architecture](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/demo-architecture.webp)
_Demo Architecture_

### Preparing the environment

If you want to follow along, there are a few things that you will need:

- The latest Talos ISO image (`1.5.3` at the time of making this video)

 ```bash
 export TALOS_VERSION=v1.5.3
 wget https://github.com/siderolabs/talos/releases/download/$TALOS_VERSION/metal-amd64.iso -O talos-$TALOS_VERSION-amd64.iso
 ```

 Either flash this onto a USB drive, or upload it into your hypervisor. For this demo, I will be uploading it into Proxmox.

- At least one server or virtual machine to install Talos on

 For this demo, I will be setting up 3 virtual machines, each of them with 8 CPU cores, 16 gigabytes of RAM and a 32 gigabyte boot disk. There's nothing special about the VM creation process for Talos as opposed to any other OS, so I will not go through it step by step.

> Make sure you have to set the CPU type either to `host` or to `x86-64v2` if you are on PVE version `8.0` or newer.
{: .prompt-warning }

- `[optional]`: DHCP reservations for your virtual machines

 I also made some reservations in my DHCP server to give my VMs the following IPs and hostnames:

 |    hostname     |      ip      |
 | :-------------: | :----------: |
 | `talos-demo-01` | `10.0.10.11` |
 | `talos-demo-02` | `10.0.10.12` |
 | `talos-demo-03` | `10.0.10.13` |

- `kubectl` installed on your local machine

 ```bash
 export KUBECTL_VERSION=v1.28.2

 # Download the binary
 curl -LO https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/amd64/kubectl

 # Make it executable
 chmod +x kubectl

 # Put it in PATH
 sudo mv kubectl /usr/local/bin/kubectl

 # Check installation
 kubectl --version
 ```

- `talosctl` installed on your local machine

 ```bash
 export TALOS_VERSION=v1.5.3

 # Download the binary
 wget https://github.com/siderolabs/talos/releases/download/$TALOS_VERSION/talosctl-linux-amd64

 # Make it executable
 chmod +x talosctl-linux-amd64

 # Put it in PATH
 sudo mv talosctl-linux-amd64 /usr/local/bin/talosctl

 # Check installation
 talosctl --version
 ```

With all that out of the way, let's get straight to installing Talos.

### Creating the Talos configuration file

The first step is to generate the secrets bundle. This file contains all the sensitive information (keys, certificates) used to define the cluster. Needless to say, this file **should not** be pushed to git unless encrypted beforehand. A common tool for handling this encryption is `sops`, but that is outside of the scope of this post.

```bash
talosctl gen secrets
```

Now we need to generate the YAML file which will configure our entire cluster, both in terms of Talos and in terms of Kubernetes. To do that, we can use the `talosctl gen config` command. This command has two required parameters we need to specify:

- The name of the cluster

 Similar to how we’re using `kubectl` to manage multiple Kubernetes clusters, so can we manage multiple Talos clusters using `talosctl`. In both cases, switching between clusters is done using contexts and the contexts are identified via `<username>@<cluster name>`.

 For my cluster, I'll use the name `demo-cluster`.

- The Kubernetes endpoint, which will be used to bootstrap Kubernetes later on

 This should be either the DNS name or the IP address of a load balancer placed in front of the control-plane nodes of your Kubernetes cluster to ensure high availability. Luckily, Talos has some built-in configuration to set up a virtual IP in order to loadbalance requests to the Kubernetes API, so we will use that.

 Since my nodes have the IPs of `10.0.10.11`, `10.0.10.12` and `10.0.10.13`, I will use the `10.0.10.10` IP address for my Kubernetes VIP.

To customize the default configuration, we can either just generate it as-is, and then manually go through the YAML files to adjust them, or we can do it more elegantly using configuration patches.

> _spoiler: we're doing it via config patches 😉_

The first patch will simply allow pods to be scheduled on controlplane nodes. This is required since we're running a 3-node HA cluster, so all nodes will be both control-plane and data-plane. By default, control-plane nodes have a taint on them that prevents workloads from getting assigned, so we need to work around that.

```yaml
---
cluster:
  allowSchedulingOnControlPlanes: true
```
{: file='patches/allow-controlplane-workloads.yaml'}

Next, let's enable kubelet certificate rotation and ensure that new certificates are approved automatically using the `kubelet-serving-cert-approver`. This will make sure that system health reporting works in our talos dashboard, allowing talos to have access to the health status of the kubernetes controlplane components, as well as other tools, such as the `metrics-server`.

```yaml
---
machine:
  kubelet:
    extraArgs:
      rotate-server-certificates: true

cluster:
  extraManifests:
    - https://raw.githubusercontent.com/alex1989hu/kubelet-serving-cert-approver/main/deploy/standalone-install.yaml
```
{: file='patches/kubelet-certificates.yaml'}

On Talos version `v1.5.0`, predictable interface names have been enabled. Personally, I dislike this, especially on virtual environments where all nodes are more or less identical, given that hardware is virtualized. Thus, what I like to do is to disable predictable interface names by setting the kernel argument `net.ifnames` to `0`. This makes sure that all my interfaces have similar names, such as `eth0` and `eth1` as opposed to `eth<MAC>`.

```yaml
---
machine:
  install:
    extraKernelArgs:
      - net.ifnames=0
```
{: file='patches/interface-names.yaml'}

Next, I want to enable DHCP on the `eth0` interface on all nodes. Since I already created the static leases in my DHCP server. My nodes will get both the IP and the hostname from that.

```yaml
---
machine:
  network:
    interfaces:
      - interface: eth0
        dhcp: true
```
{: file='patches/dhcp.yaml'}

And finally I will configure the virtual IP I mentioned earlier, which will act as my Kubernetes API load balancer.

```yaml
---
machine:
  network:
    interfaces:
      - interface: eth0
        vip:
          ip: 10.0.10.10
```
{: file='patches/vip.yaml'}

For the cluster networking solution, Talos uses `flannel` by default, but we can either override that to deploy something else or just disable it entirely, if we want to manually deploy one after the fact. Normally, I disable it by setting `cluster.network.cni.name: none` and then I deploy `cilium` after the fact using `helm`, but for the purposes of this demo I will create a dedicated patch to deploy `calico` on the cluster so that we're ready to go once the installation is complete and our nodes can reach the `Ready` state:

```yaml
---
cluster:
  network:
    cni:
      name: custom
      urls:
        - https://docs.projectcalico.org/archive/v3.20/manifests/canal.yaml
```
{: file='patches/cni.yaml'}

And finally, the last thing to do is to specify the disk on which we want our OS to be installed. If you set the disk bus to `SCSI` when creating the VM, it will most likely be `/dev/sda`, or `/dev/vda` if the bus was set to `VirtIO`. However, you can get a list of all of the available disks using the `talosctl disks` command.

```bash
talosctl disks --insecure --nodes 10.0.10.11
```

In this case, I will create a patch that will select `/dev/sda` as the installation target.

```yaml
---
machine:
    install:
        disk: /dev/sda
```
{: file='patches/install-disk.yaml'}

With all of the config-patches in the `patches/` directory, we can go ahead and generate our config file.

```bash
talosctl gen config demo-cluster https://10.0.10.10:6443 \
  --with-secrets secrets.yaml \
  --config-patch @patches/allow-controlplane-workloads.yaml \
  --config-patch @patches/cni.yaml \
  --config-patch @patches/dhcp.yaml \
  --config-patch @patches/install-disk.yaml \
  --config-patch @patches/interface-names.yaml \
  --config-patch @patches/kubelet-certificates.yaml \
  --config-patch-control-plane @patches/vip.yaml \
  --output rendered/
```

This command has now generated 3 files for us:

`controlplane.yaml` : the machine config file for the control-plane nodes of the cluster
`worker.yaml` : the machine config file for the worker nodes of the cluster
`talosconfig` : which is the Talos equivalent of a `kubeconfig` file

### Installing Talos

We can go ahead and apply this config to our machines with the `talosctl apply` command:

```bash
talosctl apply -f rendered/controlplane.yaml -n 10.0.10.11 --insecure
talosctl apply -f rendered/controlplane.yaml -n 10.0.10.12 --insecure
talosctl apply -f rendered/controlplane.yaml -n 10.0.10.13 --insecure
```

The `talosctl` commands follow the UNIX principle of "no output is good output", so don't expect anything to happen in your terminal (assuming everything went fine thus far).

To check if the command worked, you can take a look at the console of the VM in Proxmox. The status of the machine should have changed from `Maintenance` to `Booting` and then to `Installing`. We can't access the talos dashboard remotely yet, since we need the `talosconfig` first, so let's do that now.

### Configuring `talosctl`

While Talos is getting _auto-magically_ installed on our nodes, we can configure the `talosctl` utility to work with our new cluster.

In this regard, `talosctl` is identical to `kubectl`. We can specify the config file...:

|                       |     `kubectl`     |    `talosctl`    |
| :-------------------- | :---------------: | :--------------: |
| ...using the CLI flag |  `--talosconfig`  |  `--kubeconfig`  |
| ...using the env var  |   `TALOSCONFIG`   |   `KUBECONFIG`   |
| ...by placing it at   | `~/.talos/config` | `~/.kube/config` |

Thus, all we need to do now is to create the `.talos` directory, and then to move our `talosconfig` file in there.

```bash
mkdir -p ~/.talos
cp rendered/talosconfig ~/.talos/config
```

Alternatively, you can just set the environment variable like so:

```bash
export TALOSCONFIG=./rendered/talosconfig
```

Either option works fine, I just personally dislike using the CLI flag as it involves too much typing 😅

```bash
mike@talos-demo-ctl:~/workspace$ talosctl config contexts
CURRENT     NAME            ENDPOINTS       NODES
*           demo-cluster    127.0.0.1
```

By default it is set to `localhost`, which is not what we want. This should be the IP address or a DNS name of a load balancer that is placed in front of the Talos control-plane nodes. If you set up an external load balancer previously for your Kubernetes control-plane nodes, then you can use that here as well.

If you set up a VIP, however, DO NOT use that here, since the VIP requires Kubernetes to be up and running to function, so if you have some issues with your Kubernetes cluster you will lose access to the Talos API as well.

What we can do instead is to pass in a list of the IP addresses of our controlplane nodes and then the `talosctl` utility will automatically load balance the requests between them.

```bash
talosctl config endpoint 10.0.10.11 10.0.10.12 10.0.10.13
```

After running that command, we can take another look at the configured contexts to validate the endpoints were set correctly:

```bash
mike@talos-demo-ctl:~/workspace$ talosctl config contexts
CURRENT     NAME            ENDPOINTS                           NODES
*           demo-cluster    10.0.10.11,10.0.10.12,10.0.10.13
```

You may notice that there's nothing configured under the `NODES` column. This means that there is no default node that `talosctl` will target with our commands, so we have to manually specify one with the `-n` or `--nodes` flags. You can set a default node if you want to, by running the following command.

```bash
talosctl config node 10.0.10.11
```

And with that, the context should finally look something like this:

```bash
mike@talos-demo-ctl:~/workspace$ talosctl config contexts
CURRENT     NAME            ENDPOINTS                           NODES
*           demo-cluster    10.0.10.11,10.0.10.12,10.0.10.13    10.0.10.11
```

I am not particularly a fan of this as it will cause commands to fail if that node in particular is unavailable or unresponsive for whatever reason, unless you manually specify another node to run on.

With all that being said, we now have a fully functional `talosconfig` so we can go ahead and issue `talosctl` commands against our cluster.

We can monitor the progress of the installation on our nodes by taking a look at the talos dashboard. What we're looking for is for the `kubelet` to be reported as healthy in the top section and for a log entry along the lines of `etcd is waiting to join the cluster, if this node is the first node in the cluster, please run 'talosctl bootstrap'`

![`talosctl dashboard -n talos-demo-01`](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/talos-logs-etcd-waiting.webp)
_`talosctl dashboard -n talos-demo-01`_

To check that all of the nodes have joined the cluster we can issue a `talosctl get members` command against either of the controlplane nodes, or without specifying the node if you set a default one previously.

```bash
mike@talos-demo-ctl:~/workspace$ talosctl get members -n 10.0.10.11
NODE        NAMESPACE   TYPE    ID              VERSION     HOSTNAME                        MACHINE TYPE    OS              ADDRESSES
10.0.10.11  cluster     Member  talos-demo-01   2           talos-demo-01.mirceanton.local  controlplane    Talos (v1.5.4)  ["10.0.10.11"]
10.0.10.11  cluster     Member  talos-demo-02   1           talos-demo-02.mirceanton.local  controlplane    Talos (v1.5.4)  ["10.0.10.12"]
10.0.10.11  cluster     Member  talos-demo-03   1           talos-demo-03.mirceanton.local  controlplane    Talos (v1.5.4)  ["10.0.10.13"]
```

### Bootstrapping Kubernetes

Once all of the Talos nodes have finished up booting and have joined the (Talos) cluster, we can install Kubernetes by issuing a `talosctl bootstrap` command against any one of the control-plane nodes. It doesn't matter which node we pick and it will have no special function/attributes later on.

Since this command also follows the "no output is good output" principle, so don't expect anything to happen in your terminal. What I recommend doing is to open a Talos dashboard on the node you will perform the bootstrap operation on so that you can observe the logs in real-time:

```bash
talosctl dashboard -n talos-demo-01
```

And then from another terminal session run the following command:

```bash
talosctl bootstrap -n talos-demo-01
```

You should now see more activity in the bottom section of the window, which shows us the logs of what is happening. What we're waiting for here is for all of the components to be reported as `Healthy` in the top part of the screen, and for the VIP IP to show up as well:

![`talosctl dashboard -n talos-demo-01` output](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/kubernetes-bootstrap-healthy.webp)
_`talosctl dashboard -n talos-demo-01` output_

Once that's done, we can go ahead and fetch the `kubeconfig` for our cluster by running the `talosctl kubeconfig` command against any one of the control-plane nodes:

```bash
talosctl kubeconfig -n talos-demo-01
```

This command has now created the `.kube` directory in our home directory, it has fetched the `kubeconfig` file for us and put it in `~/.kube/config` so that we can start issuing `kubectl` commands right away.

We can now issue a `kubectl get nodes` command and wait for all of the nodes to finish setting up:

```bash
mike@talos-demo-ctl:~/workspace$ kubectl get nodes
NAME            STATUS  ROLES           AGE     VERSION
talos-demo-01   Ready   control-plane   2m14s   v1.28.2
talos-demo-02   Ready   control-plane   2m16s   v1.28.2
talos-demo-03   Ready   control-plane   2m2s    v1.28.2
```

And if we're taking a look at all of the pods currently running in our cluster, we can see that we only have a pretty bare deployment, consisting only of the core k8s components, our `calico` networking solution and the `kubelet-serving-cert-approver`:

```bash
mike@talos-demo-ctl:/workspace$ kubectl get pods -A
NAMESPACE                       NAME        READY       STATUS      RESTARTS        AGE
kube-system                     calico-kube-contdollers-6bdbc5dfcb-24c4s            1/1     Running     0               2m29s
kube-system                     canal-7px15                                         1/2     Running     1 (55s ago)     2m10s
kube-system                     canal-g78g7                                         1/2     Running     1 (92s ago)     2m24s
kube-system                     canal-gn5nf                                         1/2     Running     1 (58s ago)     2m22s
kube-system                     coredns-78f679c54d-h2fws                            1/1     Running     0               2m29s
kube-system                     coredns-78f679c54d-xpjwz                            1/1     Running     0               2m29s
kube-system                     kube-apiserver-talos-demo-01                        1/1     Running     0               64s
kube-system                     kube-apiserver-talos-demo-02                        1/1     Running     0               78s
kube-system                     kube-apiserver-talos-demo-03                        1/1     Running     0               74s
kube-system                     kube-controller-manager-talos-demo-01               1/1     Running     2 (2m48s ago)   73s
kube-system                     kube-controller-manager-talos-demo-02               1/1     Running     4 (3m14s ago)   70s
kube-system                     kube-controller-manager-talos-demo-03               1/1     Running     3 (2m38s ago)   63s
kube-system                     kube-proxy-bzknr                                    1/1     Running     0               2m10s
kube-system                     kube-proxy-ssjdk                                    1/1     Running     0               2m22s
kube-system                     kube-proxy-xrcch                                    1/1     Running     0               2m24s
kube-system                     kube-scheduler-talos-demo-01                        1/1     Running     4 (3m14s ago)   64s
kube-system                     kube-scheduler-talos-demo-02                        1/1     Running     4 (3m23s ago)   90s
kube-system                     kube-scheduler-talos-demo-03                        1/1     Running     4 (2m23s ago)   97s
kubelet-serving-cert-approver   kubelet-serving-cert-approver-58b48cf746-gwcxn      1/1     Running     0               2m29s
```

### Deploying a Test Workload

With Kubernetes up and running, we'll quickly test the functionality of our new cluster by deploying an NGINX web-server and exposing it using a `NodePort` service:

```bash
kubectl create deployment nginx-demo --image nginx --replicas 1
kubectl expose deployment nginx-demo --type NodePort --port 80
```

If we run a `kubectl get pods -o wide` command, we can see that the pod is in a `Running` state and that it was scheduled on the node `talos-demo-01`:

```bash
mike@talos-demo-ctl:~/workspace$ kubectl get pods -o wide
NAME                            READY   STATUS      RESTARTS    AGE     IP              NODE            NOMINATED NODE  READINESS GATES
nginx-demo-554db85f85-gl9k2     1/1     Running     0           9s      10.244.1.2      talos-demo-01   <none>          <none>
```

Now that we know the node on which the pod is running on, we need to also find out the port on which the service is listening. By running a `kubectl get svc` command, we can see that our `nginx-demo` service is listening on the port `31552`.

```bash
mike@talos-demo-ctl:~/workspace$ kubectl get services
NAME            TYPE        CLUSTER-IP      EXTERNAL-IP     PORT(S)         AGE
kubernetes      ClusterIp   10.96.0.1       <none>          443/TCP         4m28s
nginx-demo      NodePort    10.111.4.12     <none>          80:31552/TCP    6s
```

Now we should now be able to access our NGINX web server by going to the IP address of the node on which the pod was scheduled, followed by the port number that was associated with the service:

![The NGINX web server on node talos-demo-01](/assets/img/posts/2023-11-28-the-best-os-for-kubernetes/nginx-webpage.webp)

## Conclusion

And there you have it! We've successfully deployed a Kubernetes cluster in our infrastructure using Talos Linux and we also ran a test workload to ensure our cluster's functionality.

What makes this approach particularly appealing is our reliance on first-party tools and the added flexibility of machine-config manifests. With these files handy, tearing down and redeploying the cluster is as easy as running a `talosctl reset` command and then applying the config files again. Can't get much easier than this!

In some of the future posts we'll build upon this foundation by deploying other crucial services, like an in-cluster storage solution or an ingress controller. But first, we must set up the structure for proper GitOps automation!

Until next time, happy clustering!

---

{% include embed/youtube.html id='4_U0KK-blXQ' %}
📹 [Watch Video](https://www.youtube.com/watch?v=3T5wBZOm4hY)
