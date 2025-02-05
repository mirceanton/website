---
title: Terraform Applying my Internet Away
description: Home network automation with Terraform and MikroTik RouterOS.
tags:
  - terraform
  - mikrotik
  - networking
image:
  path: /assets/img/posts/2025-02-11-mikrotik-terraform/featured.webp
  lqip: /assets/img/posts/2025-02-11-mikrotik-terraform/featured_lqip.webp
date: 2025-02-11
---

## Network Diagram

![Network Diagram](/assets/img/posts/2025-02-11-mikrotik-terraform/network-diagram.webp)

If we break it all down, there's 6 networks involved:

1. Servers
2. Kubernetes
3. Trusted
4. Untrusted
5. IoT
6. Guest
