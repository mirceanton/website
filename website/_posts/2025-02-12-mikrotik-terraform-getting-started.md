---
title: Getting Started With Mikrotik and Terraform
description: Adopting your Mikrotik router to Terraform for automation and management.
tags:
  - terraform
  - mikrotik
image:
  path: /assets/img/posts/2025-02-12-mikrotik-terraform-getting-started/featured.webp
  lqip: /assets/img/posts/2025-02-12-mikrotik-terraform-getting-started/featured_lqip.webp
date: 2025-02-12
---

After much ado and months of procrastination, we're finally here! In this blog post we're gonna be getting started with our Terraform-Mikrotik network automation. The goals for this one are not overly ambitious, but that's not to say they're not important. What I'm setting out to achieve is:

1. Connecting Terraform to Mikrotik,
2. Importing the default Mikrotik configuration that comes with my RB5009 into Terraform,
3. Making the *least* amount of changes necessary to get internet access.

Again, this might not seem like much, but it will be a very solid base for our network automation. At the end of this post, my entire Mikrotik router will be terraform-managed!

## Setting up our Dev Environment

The prerequisites for this one are super light. All we really need is to have the terraform CLI installed. If you haven't installed it yet, you can follow the official [installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) or use whatever package manager you fancy.

For this tutorial, I will once more be using [`mise`](https://mise.jdx.dev/) to manage my dev tools:

```bash
Workspace/terraform/mikrotik-demo
❯ mise use aqua:hashicorp/terraform
mise ~/Workspace/terraform/mikrotik-demo/mise.toml tools: aqua:hashicorp/terraform@1.10.5
```

The important thing for this section is to be able to run terraform commands. You should be able to run `terraform version` and see some output similar to this:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform version
Terraform v1.10.5
```

## Connecting Terraform to Mikrotik

Now that terraform is all set up, we need to install the RouterOS provider and connect it to our Mikrotik device.

### Installing the Provider

The provider we're going to use is [terraform-routeros](https://registry.terraform.io/providers/terraform-routeros/routeros/latest). We're going to install the latest version which, at the time of writing, is `1.76.3`. To do that, I typically create a `providers.tf` file in the root of my project and configure the `required_providers` block there:

```terraform
terraform {
  required_providers {
    routeros = {
      source  = "terraform-routeros/routeros"
      version = "1.76.0"
    }
  }
}
```
{: file='provider.tf'}

With that in place, we need to tell terraform to download and set up that provider. Basically, we need to initialize our workspace. To do that, we need to run the `terraform init` command:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform init
Initializing the backend...
Initializing provider plugins...
- Finding terraform-routeros/routeros versions matching "1.76.0"...
- Installing terraform-routeros/routeros v1.76.0...
- Installed terraform-routeros/routeros v1.76.0 (self-signed, key ID 45571F2D7311B119)
Partner and community providers are signed by their developers.
If you'd like to know more about provider signing, you can read about it here:
https://www.terraform.io/docs/cli/plugins/signing.html
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

### Configuring the Provider

With the provider installed, we need to configure it to basically tell it at which IP address it can find our router and the credentials it needs to use to authenticate. This is done by adding a `provider` block with the required parameters which you can find in the [official documentation](https://registry.terraform.io/providers/terraform-routeros/routeros/latest/docs#example-usage) of the provider.

> By default, Mikrotik routers use an IP of `192.168.88.1` and a username of `admin`.  
> Depending on your model, the password *might* be blank or it *might* be randomized. If it's blank, well... you'll know. If it's randomized, it will be written on your device, on the label next to the serial number and whatnot.
{: .prompt-info }

I typically dump that config in my `providers.tf` file as well:

```terraform
# ...
provider "routeros" {
  hosturl  = var.mikrotik_host_url
  username = var.mikrotik_username
  password = var.mikrotik_password
  insecure = var.mikrotik_insecure
}
```
{: file='provider.tf'}

You can see here that I defined variables for all these connection parameters instead of hardcoding them in. You *can* do that if you want to (put your credentials in there), but I don't really recommend to, especially if you intend to push this code to git eventually.

To be able to use these variables, we need to first define them:

```terraform
variable "mikrotik_host_url" {
  type        = string
  sensitive   = false
  description = "The URL of the MikroTik device."
}

variable "mikrotik_username" {
  type        = string
  sensitive   = true
  description = "The username for accessing the MikroTik device."
}

variable "mikrotik_password" {
  type        = string
  sensitive   = true
  description = "The password for accessing the MikroTik device."
}

variable "mikrotik_insecure" {
  type        = bool
  default     = true
  description = "Whether to allow insecure connections to the MikroTik device."
}
```
{: file='variables.tf'}

And now we need to tell terraform what the values for these variables actually are. I typically create a `credentials.auto.tfvars` file and make sure to `gitignore` it.

Another note here is that while you can continue using the `admin` user, it is best practice to log in and create a dedicated user for terraform. I personally created mine with full administrative rights:

```terraform
mikrotik_host_url = "https://192.168.88.1"
mikrotik_username = "terraform"
mikrotik_password = "terr4f0rm"
mikrotik_insecure = true
```
{: file='credentials.auto.tfvars'}

### Validating the Connection

At this point we should be all set up and ready to go. We can run `terraform apply` to validate the connection to our Mikrotik router:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform apply

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration and found no
differences, so no changes are needed.

Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
```

If you see output similar to the above, then it means terraform has successfully connected to your Mikrotik device, and you're ready to move on to the next steps!

## Importing the Default Config

With terraform connected to our router, there are 2 main courses of action we can choose from:

1. We can reset our router, making sure to disable any kind of default configuration and create everything from scratch using terraform
2. We can model a terraform configuration that mirrors the default RouterOS configuration and strategically import resources under terraform management

Each option has pros and cons, and I'm not really going to debate which is better and why. The former option is, at least in terms of the procedure, simpler. You just reset the router and start terraforming right away. That being said, I'll go for the latter in this guide so that I don't have to battle configuring my router at the same time as I am battling managing it via terraform.

I am fairly new to mikrotik devices in general, so I want to take it one step at a time. Firstly, I want to onboard the default configuration and get a feeling for managing this router via terraform and I can get fancy with the config later on.

For now, let's take a quick look at the default configuration that came with my RB5009. I won't drop the entire `export` here. You can find in in [this gist](https://gist.github.com/mircea-pavel-anton/11852c0978c974d36ce0e28945878ef8). I'll take things step by step and see how Mikrotik config translates into terraform resources.

### Bridge Interface

By default, Mikrotik create **one bridge interface per switch chip** in your device. Since my RB5009 has only one switch chip, it has one default bridge called... well... `bridge` 😅:

```sh
/interface bridge
add admin-mac=48:A9:8A:BD:AB:D5 auto-mac=no comment=defconf name=bridge
```

We can define this bridge as a terraform resource like so:

```terraform
resource "routeros_interface_bridge" "bridge" {
  name           = "bridge"
  admin_mac      = "48:A9:8A:BD:AB:D5"
}
```
{: file='bridge.tf'}

But we can't apply this yet. If we do, RouterOS will complain that another bridge with that name already exists. It won't automatically detect that what we want to create already exists, so we need to **import** the bridge into terraform. To do that, we first need to get the ID of the resource:

```sh
[admin@Mikrotik] > :put [/interface/bridge get [print show-ids]]
Flags: X - disabled, R - running 
*B R name="bridge" mtu=auto actual-mtu=1500 l2mtu=1514 arp=enabled arp-timeout=auto mac-address=48:A9:8A:BD:AB:D5 protocol-mode=rstp 
     fast-forward=yes igmp-snooping=no auto-mac=no admin-mac= ageing-time=5m priority=0x8000 max-message-age=20s 
     forward-delay=15s transmit-hold-count=6 vlan-filtering=yes ether-type=0x8100 pvid=1 frame-types=admit-all ingress-filtering=yes 
     dhcp-snooping=no port-cost-mode=long mvrp=no max-learned-entries=auto 
no such item
```

From this output, we can see the ID is `*B`, so we need to import the bridge like so:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform import routeros_interface_bridge.bridge "*B"
routeros_interface_bridge.bridge: Importing from ID "*B"...
routeros_interface_bridge.bridge: Import prepared!
  Prepared routeros_interface_bridge for import
routeros_interface_bridge.bridge: Refreshing state... [id=*B]

Import successful!

The resources that were imported are shown above. These resources are now in
your Terraform state and will henceforth be managed by Terraform.
```

With the bridge created and imported, we can move on to the bridge ports. Typically, one interface will be dedicated as a WAN port (in my case `ether1`), and then all other interfaces will be added to this bridge as part of the LAN network:

```sh
/interface bridge port
add bridge=bridge comment=defconf interface=ether2
add bridge=bridge comment=defconf interface=ether3
add bridge=bridge comment=defconf interface=ether4
add bridge=bridge comment=defconf interface=ether5
add bridge=bridge comment=defconf interface=ether6
add bridge=bridge comment=defconf interface=ether7
add bridge=bridge comment=defconf interface=ether8
add bridge=bridge comment=defconf interface=sfp-sfpplus1
```

In terraform terms, we can bundle together all bridge ports into a single resource with a `for_each` block to keep things a bit cleaner:

```terraform
# ...
resource "routeros_interface_bridge_port" "bridge_ports" {
  for_each = {
    "ether2" = { comment = "", pvid = "1" }
    "ether3" = { comment = "", pvid = "1" }
    "ether4" = { comment = "", pvid = "1" }
    "ether5" = { comment = "", pvid = "1" }
    "ether6" = { comment = "", pvid = "1" }
    "ether7" = { comment = "", pvid = "1" }
    "ether8" = { comment = "", pvid = "1" }
    "sfp-sfpplus1" = { comment = "", pvid = "1" }
  }
  bridge    = routeros_interface_bridge.bridge.name
  interface = each.key
  comment   = each.value.comment
  pvid      = each.value.pvid
}
```
{: file='bridge.tf'}

Again, we need to fetch the IDs to import them, so let's go back over to winbox to get those:

```sh
[admin@Mikrotik] > :put [/interface/bridge/port get [print show-ids]]
Flags: I - INACTIVE; H - HW-OFFLOAD
Columns: INTERFACE, BRIDGE, HW, PVID, PRIORITY, HORIZON
*     INTERFACE     BRIDGE  HW   PVID  PRIORITY  HORIZON
*0  H ether2        bridge  yes     1  0x80      none   
*1  H ether3        bridge  yes     1  0x80      none   
*2 IH ether4        bridge  yes     1  0x80      none   
*3 IH ether5        bridge  yes     1  0x80      none   
*4 IH ether6        bridge  yes     1  0x80      none   
*5 IH ether7        bridge  yes     1  0x80      none   
*6  H ether8        bridge  yes     1  0x80      none   
*7 IH sfp-sfpplus1  bridge  yes     1  0x80      none   
```

### IP Addresses

By default, a Mikrotik router comes configured with two IP settings:

1. **Static LAN IP:**  
   This is the IP address used by devices on your local network. In our default configuration, the router assigns the LAN interface a static IP of `192.168.88.1/24` via the bridge.

2. **Dynamic WAN IP (DHCP Client):**  
   For external connectivity, the router typically obtains a dynamic IP address on the WAN interface through DHCP. In this case, the DHCP client is configured on `ether1`.

#### Static LAN Address

The default Mikrotik configuration for the LAN IP looks like this:

```bash
[admin@MikroTik] > export
/ip address
add address=192.168.88.1/24 comment=defconf interface=bridge network=192.168.88.0
```

In Terraform, you can represent this configuration with the following resource:

```terraform
resource "routeros_ip_address" "lan" {
  address   = "192.168.88.1/24"
  interface = routeros_interface_bridge.bridge.name
  network   = "192.168.88.0"
}
```

This resource assigns the static IP `192.168.88.1/24` to the bridge interface, defining the local network as `192.168.88.0/24`.

#### Dynamic WAN IP (DHCP Client)

The default Mikrotik configuration for the DHCP client on the WAN interface is:

```bash
[admin@MikroTik] > export
/ip dhcp-client
add comment=defconf interface=ether1
```

And here’s the corresponding Terraform code:

```terraform
resource "routeros_ip_dhcp_client" "wan" {
  interface = "ether1"
}
```

This resource sets up a DHCP client on `ether1`, which allows the router to obtain a dynamic IP address from your upstream network (usually provided by your ISP or an upstream DHCP server).

By importing these IP configurations into Terraform, you gain full control over both your static LAN settings and the dynamic WAN setup—ensuring that any changes made to your network configuration are fully reproducible and managed as code.

### DHCP Server

Mikrotik routers come pre-configured with a DHCP server on the LAN network so that devices connecting to the network automatically receive a valid IP address. In the default configuration, this setup is composed of three elements:

1. **IP Pool:**  
   This defines the range of IP addresses that the DHCP server can assign to clients. In our default setup, the pool covers addresses from `192.168.88.10` to `192.168.88.254`.

2. **DHCP Server Network:**  
   This resource specifies the network details to be handed out to DHCP clients—such as the network address, gateway, and DNS server.

3. **DHCP Server:**  
   This is the actual service that listens on the designated interface (in this case, the bridge) and assigns IP addresses from the defined pool.

The default Mikrotik configuration for the DHCP server looks like this:

```sh
/ip pool
add name=default-dhcp ranges=192.168.88.10-192.168.88.254

/ip dhcp-server network
add address=192.168.88.0/24 comment=defconf dns-server=192.168.88.1 gateway=192.168.88.1

/ip dhcp-server
add address-pool=default-dhcp interface=bridge name=defconf
```

Below is how you can mirror this setup in Terraform:

```terraform
resource "routeros_ip_pool" "dhcp" {
  name   = "default-dhcp"
  ranges = ["192.168.88.10-192.168.88.254"]
}

resource "routeros_ip_dhcp_server_network" "dhcp" {
  address    = "192.168.88.0/24"
  gateway    = "192.168.88.1"
  dns_server = ["192.168.88.1"]
}

resource "routeros_ip_dhcp_server" "defconf" {
  name         = "defconf"
  address_pool = routeros_ip_pool.dhcp.name
  interface    = routeros_interface_bridge.bridge.name
}
```

### DNS

Mikrotik routers include a built-in DNS server by default, allowing network clients to resolve domain names without needing an external DNS resolver. Additionally, a static DNS entry (router.lan) is created so that the router itself can be easily referenced within the LAN.

```sh
/ip dns
set allow-remote-requests=yes

/ip dns static
add address=192.168.88.1 comment=defconf name=router.lan type=A
```

To mirror that in terraform, we need the following terraform code:

```terraform
resource "routeros_dns" "dns-server" {
  allow_remote_requests = true
  servers = [ "1.1.1.1", "8.8.8.8" ]
}
resource "routeros_ip_dns_record" "defconf" {
  name    = "router.lan"
  address = "192.168.88.1"
  type    = "A"
}
```

Do note that I am changing the upstream dns servers since I want to use `1.1.1.1` and `8.8.8.8`.

### Interface Lists

Mikrotik routers use **interface lists** to group interfaces together for easier management. These lists are particularly useful when applying firewall rules, routing configurations, and other network policies.

By default, Mikrotik creates two interface lists:

1. **WAN:** Represents the external (internet-facing) interface.
2. **LAN:** Represents the internal (local network) interfaces.

Additionally, interfaces are assigned to these lists as follows:

- The **bridge** interface (which includes LAN ports) is added to the `LAN` list.
- The **ether1** interface (usually the WAN port) is added to the `WAN` list.

```sh
/interface list
add comment=defconf name=WAN
add comment=defconf name=LAN

/interface list member
add comment=defconf interface=bridge list=LAN
add comment=defconf interface=ether1 list=WAN
```

To replicate this setup in Terraform, we need to define the interface lists and assign interfaces to them:

```terraform
resource "routeros_interface_list" "wan" {
  name    = "WAN"
}
resource "routeros_interface_list_member" "wan_ether1" {
  interface = "ether1"
  list      = routeros_interface_list.wan.name
}

resource "routeros_interface_list" "lan" {
  name    = "LAN"
}
resource "routeros_interface_list_member" "lan_bridge" {
  interface = routeros_interface_bridge.bridge.name
  list      = routeros_interface_list.lan.name
}
```

These interface lists are particularly useful when configuring **firewall rules** because instead of applying rules to individual interfaces, you can apply them to entire groups. This makes managing network security and policies much easier.

### IPv4 Firewall

Speaking of the devil, let's talk about firewall rules now. For the sake of keeping this post within a reasonable length (and also to hopefully hide my noob-ness), I won't go into detail about the default firewall ruleset.

All I'm going to say here is that firewall rules are applied from the top down. This means that, when you read the list starting from the top, if traffic matches one of the rules it will get filtered accordingly. If it does not, it keeps going down the list until it either finds a match or it reaches the end.

If it reaches the end without finding a match, mikrotik has, for whatever reason, a **default allow** policy in place. This means that having no firewall rules will actually leave you wide open instead of completely blocked, as would be the case with other firewalls.

With that being said, here is the default ruleset for IPv4:

```sh
/ip firewall filter
add action=accept chain=input comment="defconf: accept established,related,untracked" connection-state=established,related,untracked
add action=drop chain=input comment="defconf: drop invalid" connection-state=invalid
add action=accept chain=input comment="defconf: accept ICMP" protocol=icmp
add action=accept chain=input comment="defconf: accept to local loopback (for CAPsMAN)" dst-address=127.0.0.1
add action=drop chain=input comment="defconf: drop all not coming from LAN" in-interface-list=!LAN
add action=accept chain=forward comment="defconf: accept in ipsec policy" ipsec-policy=in,ipsec
add action=accept chain=forward comment="defconf: accept out ipsec policy" ipsec-policy=out,ipsec
add action=fasttrack-connection chain=forward comment="defconf: fasttrack" connection-state=established,related hw-offload=yes
add action=accept chain=forward comment="defconf: accept established,related, untracked" connection-state=established,related,untracked
add action=drop chain=forward comment="defconf: drop invalid" connection-state=invalid
add action=drop chain=forward comment="defconf: drop all from WAN not DSTNATed" connection-nat-state=!dstnat connection-state=new in-interface-list=WAN
```

And this is how they would look in terraform code:

```terraform
resource "routeros_ip_firewall_filter" "accept_established_related_untracked" {
  action           = "accept"
  chain            = "input"
  comment          = "accept established, related, untracked"
  connection_state = "established,related,untracked"
  place_before     = routeros_ip_firewall_filter.drop_invalid.id
}

resource "routeros_ip_firewall_filter" "drop_invalid" {
  action           = "drop"
  chain            = "input"
  comment          = "drop invalid"
  connection_state = "invalid"
  place_before     = routeros_ip_firewall_filter.accept_icmp.id
}

resource "routeros_ip_firewall_filter" "accept_icmp" {
  action       = "accept"
  chain        = "input"
  comment      = "accept ICMP"
  protocol     = "icmp"
  place_before = routeros_ip_firewall_filter.capsman_accept_local_loopback.id
}

resource "routeros_ip_firewall_filter" "capsman_accept_local_loopback" {
  action       = "accept"
  chain        = "input"
  comment      = "accept to local loopback for capsman"
  dst_address  = "127.0.0.1"
  place_before = routeros_ip_firewall_filter.drop_all_not_lan.id
}

resource "routeros_ip_firewall_filter" "drop_all_not_lan" {
  action            = "drop"
  chain             = "input"
  comment           = "drop all not coming from LAN"
  in_interface_list = "!LAN"
  place_before      = routeros_ip_firewall_filter.accept_ipsec_policy_in.id
}

resource "routeros_ip_firewall_filter" "accept_ipsec_policy_in" {
  action       = "accept"
  chain        = "forward"
  comment      = "accept in ipsec policy"
  ipsec_policy = "in,ipsec"
  place_before = routeros_ip_firewall_filter.accept_ipsec_policy_out.id
}

resource "routeros_ip_firewall_filter" "accept_ipsec_policy_out" {
  action       = "accept"
  chain        = "forward"
  comment      = "accept out ipsec policy"
  ipsec_policy = "out,ipsec"
  place_before = routeros_ip_firewall_filter.fasttrack_connection.id
}

resource "routeros_ip_firewall_filter" "fasttrack_connection" {
  action           = "fasttrack-connection"
  chain            = "forward"
  comment          = "fasttrack"
  connection_state = "established,related"
  hw_offload       = "true"
  place_before     = routeros_ip_firewall_filter.accept_established_related_untracked_forward.id
}

resource "routeros_ip_firewall_filter" "accept_established_related_untracked_forward" {
  action           = "accept"
  chain            = "forward"
  comment          = "accept established, related, untracked"
  connection_state = "established,related,untracked"
  place_before     = routeros_ip_firewall_filter.drop_invalid_forward.id
}

resource "routeros_ip_firewall_filter" "drop_invalid_forward" {
  action           = "drop"
  chain            = "forward"
  comment          = "drop invalid"
  connection_state = "invalid"
  place_before     = routeros_ip_firewall_filter.drop_all_wan_not_dstnat.id
}

resource "routeros_ip_firewall_filter" "drop_all_wan_not_dstnat" {
  action               = "drop"
  chain                = "forward"
  comment              = "drop all from WAN not DSTNATed"
  connection_nat_state = "!dstnat"
  connection_state     = "new"
  in_interface_list    = "WAN"
}
```

> Not that, since ordering is important, we do have the `place_before` argument for each rule to ensure they end up in the correct order.
{: .prompt-info }

There’s probably a way to make this code more efficient using a loop block or a similar approach. Given how critical firewall rules are, however, and especially given the risk of locking myself out due to misconfigurations, I’ve decided to keep things dumb define each rule as a separate resource. This ensures I have full control over the order in which Terraform applies them.

### NAT Configuration

Mikrotik routers use **NAT (Network Address Translation)** to allow devices on the internal network (LAN) to access the internet through the WAN interface. This is done using a **masquerade** rule, which dynamically translates private IP addresses into the router's public IP.

By default, Mikrotik includes a NAT rule that masquerades outgoing traffic from the LAN to the WAN:

```sh
/ip firewall nat
add action=masquerade chain=srcnat comment="defconf: masquerade" ipsec-policy=out,none out-interface-list=WAN
```

To replicate this setup in Terraform, define the resource:

```terraform
resource "routeros_ip_firewall_nat" "masquerade" {
  chain              = "srcnat"
  action            = "masquerade"
  out_interface_list = routeros_interface_list.wan.name
}
```

- **`chain = "srcnat"`** → Specifies that this is a **source NAT (srcnat)** rule, meaning it modifies outgoing packets.  
- **`action = "masquerade"`** → Dynamically changes the source IP of outgoing packets to match the router’s public IP.  
- **`out_interface_list = routeros_interface_list.wan.name`** → Applies the rule only to traffic leaving through the WAN interface.  
- **`comment = "defconf"`** → Keeps the default configuration label for clarity.

### IPv6 Rules (or Lack Thereof)

Now, you might be expecting some detailed IPv6 firewall configurations. However, I’m going to keep this section short, and I'm fully aware that some might not agree with this approach, but here we go...

Simply put, I don’t use IPv6 in my network. I have no need for it at the moment, and I don’t want to complicate things by introducing it needlessly into my setup. IPv6, **in my opinion**, is a more advanced use case, at least when compared to basic IPv4, and while I may explore it in the future, I’m not going to bother with it right now.

With that in mind, the solution here is simple: I’ve decided to disable IPv6 entirely:

```terraform
resource "routeros_ipv6_settings" "disable" {
  disable_ipv6 = "true"
}
```

As for the IPv6 firewall rules, they’re no longer needed, so I’ll manually delete them if necessary. You can safely skip this section if you’re not using IPv6 or if you prefer to handle it in a more advanced setup later on.

### Miscellaneous Configurations

Mikrotik includes a few additional settings that control network discovery and administrative access. These settings ensure that **only devices within the LAN** can discover and manage the router.

By default, the router sets:

1. **Neighbor Discovery** → Only devices in the LAN can see the router via Mikrotik’s **Neighbor Discovery Protocol (MNDP)**.
2. **MAC Server** → Restricts access to the router's MAC-based login services (used for debugging and management).
3. **Winbox MAC Access** → Limits MAC-based access via **Winbox** (Mikrotik’s GUI management tool) to LAN devices.

```sh
/ip neighbor discovery-settings
set discover-interface-list=LAN

/tool mac-server
set allowed-interface-list=LAN

/tool mac-server mac-winbox
set allowed-interface-list=LAN
```

To mirror these settings in Terraform:

```terraform
resource "routeros_ip_neighbor_discovery_settings" "lan_discovery" {
  discover_interface_list = routeros_interface_list.lan.name
}
resource "routeros_tool_mac_server" "mac_server" {
  allowed_interface_list = routeros_interface_list.lan.name
}
resource "routeros_tool_mac_server_winbox" "winbox_mac_access" {
  allowed_interface_list = routeros_interface_list.lan.name
}
```

## Modifying the Default Config

### Configuring WAN with PPPoE

By default, Mikrotik uses **DHCP Client** to obtain an IP address for WAN. However, in some setups (like mine), **PPPoE** is required instead.

**What Needs to Change?**

1. **Remove DHCP Client** (Terraform will remove it automatically on `apply`).
2. **Create a PPPoE Client Interface** with credentials.
3. **Add PPPoE to the WAN interface list** so that firewall and NAT rules still apply.

#### Mikrotik PPPoE Configuration in Terraform

##### Define the PPPoE Client

```terraform
resource "routeros_interface_pppoe_client" "digi" {
  interface         = "ether1"
  name              = "PPPoE-Digi"
  add_default_route = true
  use_peer_dns      = false
  password          = var.digi_pppoe_password
  user              = var.digi_pppoe_username
}
```

- **`interface = "ether1"`** → The WAN interface.
- **`add_default_route = true`** → Ensures the router knows how to send traffic to the internet.
- **`use_peer_dns = false`** → Disables automatic DNS assignment (we set our own).
- **`user` / `password`** → Uses variables for authentication.

##### Define PPPoE Credentials as Variables

```terraform
variable "digi_pppoe_username" {
  type        = string
  sensitive   = true
  description = "The PPPoE username for the Digi connection."
}

variable "digi_pppoe_password" {
  type        = string
  sensitive   = true
  description = "The PPPoE password for the Digi connection."
}
```

Storing credentials as variables ensures they are **not hardcoded** into our Terraform files.

##### Add PPPoE to the WAN List

```terraform
resource "routeros_interface_list_member" "pppoe_wan" {
  interface = routeros_interface_pppoe_client.digi.name
  list      = routeros_interface_list.wan.name
}
```

This ensures that **firewall rules and NAT still apply to the new WAN connection**.

## Wrapping Up

At this point, we’ve covered the basics and set up a fully functional, automated MikroTik configuration using Terraform. We can access the internet again and all of our config is defined as code.

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ ping google.com
PING google.com (142.250.187.142) 56(84) bytes of data.
64 bytes from sof02s45-in-f14.1e100.net (142.250.187.142): icmp_seq=1 ttl=114 time=54.1 ms
64 bytes from sof02s45-in-f14.1e100.net (142.250.187.142): icmp_seq=2 ttl=114 time=54.2 ms
^C
--- google.com ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 54.148/54.157/54.167/0.009 ms
```

Of course, this is just the beginning. Sure, I have a solid base that got me up and running, but there’s plenty of room for refinement. In a future update, I’ll dive deeper into VLANs and firewall rules as I flesh out my network further. For now, though, I think I managed to achieve the goals I set out to, so I'm calling it a win.

Stay tuned for the next iteration—things are only going to get more interesting from here!
