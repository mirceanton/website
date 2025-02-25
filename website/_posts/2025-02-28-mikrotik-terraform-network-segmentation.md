---
title: Network Segmentation with Mikrotik and Terraform
description: Taking your Mikrotik router to the next level by segmenting your network with VLANs using Terraform.
tags:
  - terraform
  - mikrotik
  - networking
  - vlans
image:
  path: /assets/img/posts/2025-02-28-mikrotik-terraform-network-segmentation/featured.webp
  lqip: /assets/img/posts/2025-02-28-mikrotik-terraform-network-segmentation/featured_lqip.webp
---

In my [previous post](https://mirceanton.com/posts/mikrotik-terraform-getting-started), I covered the basics of setting up a Mikrotik router with Terraform - importing the default configuration and making minimal changes to get Internet access working. That post laid the groundwork, but my Mikrotik journey was just beginning.

Today, I'm taking things a step further - baby step indeed, but a step nonetheless - by segmenting my network into multiple VLANs, all managed through Terraform. The goal here is simple: create distinct network segments for different types of devices to keep things organized and add an extra layer of security*.

*_Note: We're not adding firewall rules just yet - that's coming in the next post!_

## My Network Layout

First things first, let's look at what I'm building. After some planning (and probably overthinking), I've settled on five distinct network segments:

![Network Diagram](/assets/img/posts/2025-03-10-mikrotik-terraform-vlans/network-diagram.webp)
_My segmented network layout_

1. **Trusted** (192.168.69.0/24) - This is for devices I have full control over, from the OS and software down to the hardware. In practice, this means personal computers.
2. **Untrusted** (192.168.42.0/24) - For devices that I don't have complete control over, mainly personal phones and tablets.
3. **IoT** (172.16.69.0/24) - For smart home devices, but for now it's really only my smart TV. I'm trying to keep all smart devices on Zigbee as much as I can, which has made things easier here.
4. **Guest** (172.16.42.0/24) - When friends come over and need internet access, but no access to other things on my network. This is also where I put my work devices since I don't want them to have access to anything else.
5. **Servers** (10.0.0.0/24) - Infrastructure services like Proxmox, TrueNAS, and my Mikrotik devices.

One important aspect of this setup is that I'm **not** routing storage traffic. My TrueNAS server has a network interface in each network that needs storage access and exposes the required services directly within those networks. This way, no SMB, NFS, iSCSI, or other storage traffic goes through my router (at least internally).

## Building a VLAN Module

Since I'm creating five networks with similar configurations, I quickly realized there would be a lot of duplicate code. Instead of copy-pasting and changing values (which is never a good idea), I decided to create a Terraform module to handle the common configuration.

I should mention that when I first started building my network, everything was copy-pasted duplicate code. It was only when I sat down to write this blog post that I actually buckled down to create a proper module and migrate my configuration to it. Nothing like the pressure of showing your work to the internet to make you clean things up!

Let's start by creating a basic structure for our module:

```bash
mkdir -p modules/vlan
touch modules/vlan/{main.tf,variables.tf,outputs.tf}
```

Running `tree modules` would show:

```
modules/
└── vlan
    ├── main.tf
    ├── outputs.tf
    └── variables.tf
```

Now, let's work through building the module one resource at a time.

### Creating a VLAN Interface

First, we need to create a VLAN interface on the bridge:

```terraform
# modules/vlan/main.tf

# Step 1: Create the VLAN interface
resource "routeros_interface_vlan" "vlan" {
  interface = var.bridge_name
  name      = var.name
  vlan_id   = var.vlan_id
}
```

This requires a few variables:

```terraform
# modules/vlan/variables.tf

variable "name" {
  description = "Name of the VLAN network"
  type        = string
}

variable "vlan_id" {
  description = "VLAN ID"
  type        = number
}

variable "bridge_name" {
  description = "Name of the bridge interface"
  type        = string
}
```

The VLAN interface needs to be created on a bridge interface, which we'll reference. The VLAN ID is what differentiates this network segment from others on the same physical interfaces.

### Adding the Interface to the LAN List

Next, we need to add this interface to our LAN interface list for firewall rules:

```terraform
# modules/vlan/main.tf (continued)

# Step 2: Add the interface to the LAN list
resource "routeros_interface_list_member" "lan" {
  interface = routeros_interface_vlan.vlan.name
  list      = var.lan_list_name
}
```

This requires another variable:

```terraform
# modules/vlan/variables.tf (continued)

variable "lan_list_name" {
  description = "Name of the LAN interface list"
  type        = string
}
```

Adding the interface to the LAN list ensures our existing firewall rules apply to it, which is important for maintaining internet access.

### Assigning an IP Address

Every network segment needs a gateway IP:

```terraform
# modules/vlan/main.tf (continued)

# Step 3: Assign an IP address
resource "routeros_ip_address" "ip" {
  address   = var.gateway
  interface = routeros_interface_vlan.vlan.name
  network   = split("/", var.network)[0]
}
```

With the variables:

```terraform
# modules/vlan/variables.tf (continued)

variable "network" {
  description = "Network address with CIDR notation (e.g., 192.168.1.0/24)"
  type        = string
}

variable "gateway" {
  description = "Gateway IP address with CIDR notation (e.g., 192.168.1.1/24)"
  type        = string
}
```

This sets up the IP address for the router on this VLAN, which will serve as the gateway for all devices in this network segment.

### Configuring Bridge VLAN Settings

Now we need to tell the bridge which interfaces should carry this VLAN:

```terraform
# modules/vlan/main.tf (continued)

# Step 4: Configure bridge VLAN settings
resource "routeros_interface_bridge_vlan" "vlan" {
  bridge   = var.bridge_name
  vlan_ids = [var.vlan_id]
  
  tagged   = var.tagged_interfaces
  untagged = var.untagged_interfaces
}
```

With the variables:

```terraform
# modules/vlan/variables.tf (continued)

variable "tagged_interfaces" {
  description = "List of interfaces that will carry tagged traffic for this VLAN"
  type        = list(string)
  default     = []
}

variable "untagged_interfaces" {
  description = "List of interfaces that will carry untagged traffic for this VLAN"
  type        = list(string)
  default     = []
}
```

Tagged interfaces will pass the VLAN ID, useful for devices that understand VLAN tags or for trunk ports to other switches. Untagged interfaces will strip the VLAN tags, useful for devices that don't understand VLAN tagging.

### Setting Up DHCP

Finally, we need to set up DHCP so devices can get IP addresses automatically:

```terraform
# modules/vlan/main.tf (continued)

# Step 5: Set up DHCP server
locals {
  dhcp_pool_name = var.dhcp_pool_name != "" ? var.dhcp_pool_name : "${lower(var.name)}-dhcp-pool"
}

resource "routeros_ip_pool" "dhcp" {
  name    = local.dhcp_pool_name
  comment = "${var.name} DHCP Pool"
  ranges  = [var.dhcp_pool_range]
}

resource "routeros_ip_dhcp_server_network" "network" {
  comment    = "${var.name} DHCP Network"
  domain     = var.domain
  address    = var.network
  gateway    = split("/", var.gateway)[0]
  dns_server = var.dns_servers
}

resource "routeros_ip_dhcp_server" "dhcp" {
  name               = lower(var.name)
  comment            = "${var.name} DHCP Server"
  address_pool       = routeros_ip_pool.dhcp.name
  interface          = routeros_interface_vlan.vlan.name
  client_mac_limit   = 1
  conflict_detection = false
}
```

This requires more variables:

```terraform
# modules/vlan/variables.tf (continued)

variable "dhcp_pool_name" {
  description = "Name for the DHCP pool"
  type        = string
  default     = ""
}

variable "dhcp_pool_range" {
  description = "Range of IP addresses for DHCP pool"
  type        = string
}

variable "domain" {
  description = "Domain name for this network"
  type        = string
}

variable "dns_servers" {
  description = "List of DNS servers"
  type        = list(string)
  default     = []
}
```

### Configuring Static DHCP Leases

For devices that need consistent IP addresses:

```terraform
# modules/vlan/main.tf (continued)

# Step 6: Configure static DHCP leases
resource "routeros_ip_dhcp_server_lease" "leases" {
  for_each = var.static_leases

  server       = routeros_ip_dhcp_server.dhcp.name
  mac_address  = each.value.mac_address
  address      = each.value.address
  comment      = each.key
}
```

With the variable:

```terraform
# modules/vlan/variables.tf (continued)

variable "static_leases" {
  description = "Map of static DHCP leases"
  type        = map(object({
    address     = string
    mac_address = string
  }))
  default = {}
}
```

Static leases ensure specific devices always get the same IP address, which is useful for devices you want to access consistently.

### Adding Outputs

Finally, let's define some outputs that might be useful when using the module:

```terraform
# modules/vlan/outputs.tf

output "vlan_interface_name" {
  description = "Name of the created VLAN interface"
  value       = routeros_interface_vlan.vlan.name
}

output "vlan_id" {
  description = "ID of the VLAN"
  value       = var.vlan_id
}

output "ip_address" {
  description = "IP Address assigned to the VLAN interface"
  value       = routeros_ip_address.ip.address
}
```

## Creating Network Segments

Now with our module complete, we can create all five network segments. The bridge and interface lists should already exist from our previous post, but I'll include them here for reference:

```terraform
# main.tf

resource "routeros_interface_bridge" "bridge" {
  name      = "bridge"
  admin_mac = "48:A9:8A:BD:AB:D5"
}

resource "routeros_interface_list" "lan" {
  name = "LAN"
}

resource "routeros_interface_list_member" "bridge_lan" {
  interface = routeros_interface_bridge.bridge.name
  list      = routeros_interface_list.lan.name
}
```

### Guest Network

First up, let's create the Guest network:

```terraform
module "guest_network" {
  source = "./modules/vlan"

  name          = "Guest"
  vlan_id       = 1742
  network       = "172.16.42.0/24"
  gateway       = "172.16.42.1/24"
  bridge_name   = routeros_interface_bridge.bridge.name
  lan_list_name = routeros_interface_list.lan.name

  tagged_interfaces = [
    routeros_interface_bridge.bridge.name,
    routeros_interface_ethernet.access_point.name,
  ]

  dhcp_pool_range = "172.16.42.10-172.16.42.250"
  domain          = "guest.h.mirceanton.com"
  
  # I'm using public DNS servers for the guest network since I don't want 
  # these devices to have access to my internal services
  dns_servers     = ["1.1.1.1", "1.0.0.1", "8.8.8.8"]
}
```

I'm specifically using an RFC1918 `172.16.x.x` IP range for my guest network so that it's visibly very different from my other subnets. This way I can immediately identify the trust level of a network just by looking at the IP address.

The Guest network is only accessible via WiFi, which is why I'm only tagging the access point interface. I'm using public DNS servers since I don't want these devices to have access to anything internal.

I'm using `h.mirceanton.com` as my internal domain for my home network, where 'h' stands for home.

### IoT Network

Next, let's set up the IoT network:

```terraform
module "iot_network" {
  source = "./modules/vlan"

  name          = "IoT"
  vlan_id       = 1769
  network       = "172.16.69.0/24"
  gateway       = "172.16.69.1/24"
  bridge_name   = routeros_interface_bridge.bridge.name
  lan_list_name = routeros_interface_list.lan.name

  tagged_interfaces = [
    routeros_interface_bridge.bridge.name,
    routeros_interface_ethernet.living_room.name,
    routeros_interface_ethernet.access_point.name
  ]

  dhcp_pool_range = "172.16.69.10-172.16.69.200"
  domain          = "iot.h.mirceanton.com"
  dns_servers     = ["172.16.69.1"]
  
  static_leases = {
    "SmartTV" = { address = "172.16.69.250", mac_address = "38:26:56:E2:93:99" }
  }
}

# IoT devices allowed internet access
resource "routeros_ip_firewall_addr_list" "iot_internet" {
  list    = "iot_internet"
  comment = "IoT IPs allowed to the internet."
  address = "172.16.69.201-172.16.69.250"
}
```

I'm using another `172.16.x.x` IP range for my IoT network since it's also a lower-trust network. The `.69` vs `.42` is intentional - it's a pattern I use to indicate trust levels (69 is higher trust than 42). 

The DHCP pool range is intentionally smaller here. In my firewall setup (coming in the next post), I'll configure it so that IoT devices with DHCP-assigned IPs don't have internet access, but devices with manually assigned IPs (outside the DHCP range) will. I know this isn't foolproof, but it's good enough for my limited number of IoT devices.

I've added a static lease for my smart TV outside the DHCP pool range so it can get internet access for YouTube and other services. I'm tagging my living room switch since that's where my smart TV plugs in.

### Trusted Network

This is where my primary devices live:

```terraform
module "trusted_network" {
  source = "./modules/vlan"

  name          = "Trusted"
  vlan_id       = 1969
  network       = "192.168.69.0/24"
  gateway       = "192.168.69.1/24"
  bridge_name   = routeros_interface_bridge.bridge.name
  lan_list_name = routeros_interface_list.lan.name

  tagged_interfaces = [
    routeros_interface_bridge.bridge.name,
    routeros_interface_ethernet.living_room.name
  ]

  untagged_interfaces = [
    routeros_interface_ethernet.sploinkhole.name
  ]

  dhcp_pool_range = "192.168.69.190-192.168.69.199"
  domain          = "trst.h.mirceanton.com"
  dns_servers     = ["192.168.69.1"]

  static_leases = {
    "MirkPuter-10g" = { address = "192.168.69.69", mac_address = "24:2F:D0:7F:FA:1F" }
    "BomkPuter"     = { address = "192.168.69.68", mac_address = "24:4B:FE:52:D0:65" }
  }
}
```

I'm using a `192.168.x.x` IP range for my Trusted network since this is a much higher trust level than IoT or Guest. Again, I'm reusing the 69 vs 42 pattern to indicate that this is the higher trust network.

The untagged interface `sploinkhole` goes directly to my girlfriend's office (it was her idea for the name!). It's untagged because it connects directly to her computer.

The DHCP range is very small since I don't want random devices here. The point of DHCP is just to get devices online so I can grab their MAC address and create static reservations.

I'm using internal DNS here since I want to resolve internal services via domain names instead of IPs.

### Untrusted Network

For devices that need some restrictions:

```terraform
module "untrusted_network" {
  source = "./modules/vlan"

  name          = "Untrusted"
  vlan_id       = 1942
  network       = "192.168.42.0/24"
  gateway       = "192.168.42.1/24"
  bridge_name   = routeros_interface_bridge.bridge.name
  lan_list_name = routeros_interface_list.lan.name

  tagged_interfaces = [
    routeros_interface_bridge.bridge.name,
    routeros_interface_ethernet.living_room.name,
    routeros_interface_ethernet.access_point.name
  ]

  dhcp_pool_range = "192.168.42.100-192.168.42.199"
  domain          = "utrst.h.mirceanton.com"
  dns_servers     = ["192.168.42.1"]

  static_leases = {
    "HomeAssistant" = { address = "192.168.42.253", mac_address = "00:1E:06:42:C7:73" }
    "Mirk Phone"    = { address = "192.168.42.69", mac_address = "04:29:2E:ED:1B:4D" }
    "Bomk Phone"    = { address = "192.168.42.68", mac_address = "5C:70:17:F3:5F:F8" }
  }
}
```

I'm using a `192.168.x.x` IP range with .42 to indicate a lower trust level than my Trusted network. The DHCP range is larger here since I don't care to statically assign IPs to most devices in this network.

My Home Assistant box also lives on this network, at least for now. It's running on my Odroid N2+ with a direct connection to this VLAN.

### Servers Network

Finally, my infrastructure network:

```terraform
module "servers_network" {
  source = "./modules/vlan"

  name          = "Servers"
  vlan_id       = 1000
  network       = "10.0.0.0/24"
  gateway       = "10.0.0.1/24"
  bridge_name   = routeros_interface_bridge.bridge.name
  lan_list_name = routeros_interface_list.lan.name

  tagged_interfaces = [
    routeros_interface_bridge.bridge.name,
    routeros_interface_ethernet.living_room.name
  ]

  untagged_interfaces = [
    routeros_interface_ethernet.access_point.name
  ]

  dhcp_pool_range = "10.0.0.100-10.0.0.199"
  domain          = "srv.h.mirceanton.com"
  dns_servers     = ["10.0.0.1"]

  static_leases = {
    "CRS317" = { address = "10.0.0.2", mac_address = "D4:01:C3:02:5D:52" }
    "CRS326" = { address = "10.0.0.3", mac_address = "D4:01:C3:F8:47:04" }
    "hex"    = { address = "10.0.0.4", mac_address = "F4:1E:57:31:05:44" }
    "cAP-AX" = { address = "10.0.0.5", mac_address = "D4:01:C3:01:26:EB" }
    "PVE01"  = { address = "10.0.0.21", mac_address = "74:56:3C:9E:BF:1A" }
    "PVE02"  = { address = "10.0.0.22", mac_address = "74:56:3C:99:5B:CE" }
    "PVE03"  = { address = "10.0.0.23", mac_address = "74:56:3C:B2:E5:A8" }
    "BliKVM" = { address = "10.0.0.254", mac_address = "12:00:96:6F:5D:51" }
  }
}
```

I'm using a `10.x.x.x` IP range for my servers to indicate that this is the highest level of trust. I'm tagging the living room switch since downstream of it is my rack.

The access point interface is untagged on this VLAN so I can access the management UI of my cAP AX.

## Deploying the Configuration

With all our network segments defined, it's time to apply the configuration. Make sure you've initialized your Terraform workspace with the RouterOS provider from my [previous post](https://mirceanton.com/posts/mikrotik-terraform-getting-started), then run:

```bash
terraform plan
```

Review the plan to ensure everything looks correct, then apply it:

```bash
terraform apply
```

One important note: Be careful not to cut yourself off during this process! When tagging/untagging interfaces, you can unintentionally lock yourself out, which would cause the Terraform apply to fail.

To be safe, I ran a temporary cable from my PC to my router and plugged it into an empty port that wasn't part of my final config. This maintained a connection throughout the entire process.

Also, I didn't delete the old default configuration (the 192.168.88.0 network) until everything was working. It's now safe to remove those resources (IP address, DHCP server), but NOT the interface list.

Make sure to add all the new VLANs to the LAN interface list so that all of the previous firewall rules still apply and you maintain internet access.

## Final Thoughts

I really enjoy managing my networks this way. It's easy to see everything laid out. I especially like managing DHCP reservations and pools this way - it's much neater than other solutions I've tried.

The modular approach means I can easily add new network segments in the future or adjust the existing ones without rewriting everything from scratch. And since all my configuration is in code, I have full version control and can track changes over time.

In my next post, I'll dive into configuring firewall rules to control traffic between these network segments - ensuring my IoT devices can't access my personal data and my guest network stays properly isolated.

Have you segmented your home network? I'd love to hear about your setup in the comments!
